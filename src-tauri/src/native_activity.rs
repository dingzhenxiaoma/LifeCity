use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::CloseHandle,
    System::{
        SystemInformation::GetTickCount,
        Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    },
    UI::{
        Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
        WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
        },
    },
};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(5);
const AFK_AFTER_MS: u32 = 3 * 60 * 1000;
const MAX_SAMPLE_GAP_MS: u64 = 15_000;
const RETENTION_MS: u64 = 30 * 60 * 1000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeActivityEvent {
    id: String,
    app: String,
    title: String,
    started_at_ms: u64,
    duration_seconds: f64,
    is_afk: bool,
}

#[derive(Clone, PartialEq)]
struct Sample {
    app: String,
    title: String,
    is_afk: bool,
}

#[derive(Clone)]
struct Segment {
    id: String,
    sample: Sample,
    started_at_ms: u64,
    last_seen_ms: u64,
}

impl Segment {
    fn event(&self) -> NativeActivityEvent {
        NativeActivityEvent {
            id: self.id.clone(),
            app: self.sample.app.clone(),
            title: self.sample.title.clone(),
            started_at_ms: self.started_at_ms,
            duration_seconds: self.last_seen_ms.saturating_sub(self.started_at_ms) as f64 / 1000.0,
            is_afk: self.sample.is_afk,
        }
    }
}

struct Collector {
    session_id: u64,
    next_id: u64,
    last_sample_ms: Option<u64>,
    current: Option<Segment>,
    completed: VecDeque<Segment>,
}

impl Collector {
    fn new() -> Self {
        Self {
            session_id: unix_ms(),
            next_id: 0,
            last_sample_ms: None,
            current: None,
            completed: VecDeque::new(),
        }
    }

    fn start_segment(&mut self, sample: Sample, now_ms: u64) {
        let id = format!("native:{}:{}", self.session_id, self.next_id);
        self.next_id += 1;
        self.current = Some(Segment {
            id,
            sample,
            started_at_ms: now_ms,
            last_seen_ms: now_ms,
        });
    }

    fn finish_current(&mut self, end_ms: u64) {
        if let Some(mut segment) = self.current.take() {
            segment.last_seen_ms = end_ms.max(segment.started_at_ms);
            if segment.last_seen_ms > segment.started_at_ms {
                self.completed.push_back(segment);
            }
        }
    }

    fn record(&mut self, sample: Sample, now_ms: u64) {
        if let Some(previous_ms) = self.last_sample_ms {
            if now_ms.saturating_sub(previous_ms) > MAX_SAMPLE_GAP_MS {
                self.finish_current(previous_ms.saturating_add(SAMPLE_INTERVAL.as_millis() as u64));
            }
        }

        match self.current.as_mut() {
            Some(current) if current.sample == sample => current.last_seen_ms = now_ms,
            Some(_) => {
                self.finish_current(now_ms);
                self.start_segment(sample, now_ms);
            }
            None => self.start_segment(sample, now_ms),
        }
        self.last_sample_ms = Some(now_ms);

        let cutoff = now_ms.saturating_sub(RETENTION_MS);
        while self
            .completed
            .front()
            .is_some_and(|segment| segment.last_seen_ms < cutoff)
        {
            self.completed.pop_front();
        }
    }

    fn recent(&self, since_ms: u64) -> Vec<NativeActivityEvent> {
        self.completed
            .iter()
            .chain(self.current.iter())
            .filter(|segment| segment.last_seen_ms >= since_ms)
            .map(Segment::event)
            .filter(|event| event.duration_seconds > 0.0)
            .collect()
    }
}

pub struct NativeActivityState(Arc<Mutex<Collector>>);

impl NativeActivityState {
    pub fn start() -> Self {
        let collector = Arc::new(Mutex::new(Collector::new()));
        let background = Arc::clone(&collector);
        thread::spawn(move || loop {
            let sample = foreground_sample();
            if let Ok(mut collector) = background.lock() {
                collector.record(sample, unix_ms());
            }
            thread::sleep(SAMPLE_INTERVAL);
        });
        Self(collector)
    }
}

#[tauri::command]
pub fn collect_native_activity(
    state: State<'_, NativeActivityState>,
    since_ms: u64,
) -> Result<Vec<NativeActivityEvent>, String> {
    state
        .0
        .lock()
        .map(|collector| collector.recent(since_ms))
        .map_err(|_| "原生活动采集器状态不可用".to_string())
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(target_os = "windows")]
fn foreground_sample() -> Sample {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return Sample {
                app: "Unknown".into(),
                title: String::new(),
                is_afk: is_afk(),
            };
        }

        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        Sample {
            app: process_name(process_id).unwrap_or_else(|| "Unknown".into()),
            title: window_title(hwnd),
            is_afk: is_afk(),
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn window_title(hwnd: windows_sys::Win32::Foundation::HWND) -> String {
    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; length as usize + 1];
    let written = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
    String::from_utf16_lossy(&buffer[..written.max(0) as usize])
}

#[cfg(target_os = "windows")]
unsafe fn process_name(process_id: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
    if handle.is_null() {
        return None;
    }
    let mut buffer = vec![0u16; 32_768];
    let mut length = buffer.len() as u32;
    let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length);
    CloseHandle(handle);
    if ok == 0 {
        return None;
    }
    let path = String::from_utf16_lossy(&buffer[..length as usize]);
    std::path::Path::new(&path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

#[cfg(target_os = "windows")]
unsafe fn is_afk() -> bool {
    let mut input = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    GetLastInputInfo(&mut input) != 0 && GetTickCount().wrapping_sub(input.dwTime) >= AFK_AFTER_MS
}

#[cfg(not(target_os = "windows"))]
fn foreground_sample() -> Sample {
    Sample {
        app: "Unsupported".into(),
        title: String::new(),
        is_afk: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(app: &str) -> Sample {
        Sample {
            app: app.into(),
            title: String::new(),
            is_afk: false,
        }
    }

    #[test]
    fn coalesces_equal_samples_and_closes_on_app_change() {
        let mut collector = Collector::new();
        collector.record(sample("Code.exe"), 1_000);
        collector.record(sample("Code.exe"), 6_000);
        collector.record(sample("firefox.exe"), 11_000);

        let events = collector.recent(0);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].app, "Code.exe");
        assert_eq!(events[0].duration_seconds, 10.0);
    }

    #[test]
    fn does_not_attribute_a_long_sampling_gap_to_the_old_app() {
        let mut collector = Collector::new();
        collector.record(sample("Code.exe"), 1_000);
        collector.record(sample("Code.exe"), 21_000);

        let events = collector.recent(0);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].duration_seconds, 5.0);
    }
}
