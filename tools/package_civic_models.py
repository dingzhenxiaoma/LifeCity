"""Compose inspection sheets from renders of the delivered GLBs; package delivery."""
import json
import zipfile
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'art/buildings/civic'
P=ART/'previews'
NAMES={'development':'蓝栈研发所','gaming':'霓虹电玩社','office':'金叶写字楼',
       'learning':'知行学舍','media':'回声影院','creative':'造物工坊'}
fontpath='C:/Windows/Fonts/msyh.ttc'
def font(n):return ImageFont.truetype(fontpath,n)
for cat,name in NAMES.items():
    sheet=Image.new('RGB',(3500,1120),'#f4f0e8')
    d=ImageDraw.Draw(sheet)
    d.text((48,26),f'{name}  /  {cat.upper()}',font=font(35),fill='#354857')
    d.text((48,78),'L1 → L5 · 同比例 · 正门 +Z · GLB 实体模型渲染',font=font(22),fill='#78828a')
    for level in range(1,6):
        im=Image.open(P/f'{cat}-l{level:02d}-front-right.png').convert('RGB')
        sheet.paste(im,((level-1)*700,120))
        d.text(((level-1)*700+315,1060),f'L{level}',font=font(32),fill='#354857')
    sheet.save(P/f'{cat}-levels.png')
    pair=Image.new('RGB',(1400,1120),'#f4f0e8');d=ImageDraw.Draw(pair)
    d.text((36,22),f'{name} / L5',font=font(32),fill='#354857')
    for i,(suffix,label) in enumerate([('front-right','正面偏右 · +X / +Z'),('back-left','背面偏左 · −X / −Z')]):
        pair.paste(Image.open(P/f'{cat}-l05-{suffix}.png'),(i*700,100))
        d.text((i*700+120,1060),label,font=font(24),fill='#354857')
    pair.save(P/f'{cat}-l05-views.png')

rows=json.loads((ART/'model-report.json').read_text())
(ART/'SHA256SUMS.txt').write_text(''.join(f"{hashlib.sha256((ROOT/r['file']).read_bytes()).hexdigest()}  {r['file']}\n" for r in rows),encoding='utf-8')
contact=Image.new('RGB',(1680,840),'#f4f0e8')
cd=ImageDraw.Draw(contact)
for i,cat in enumerate(NAMES):
    for j,suffix in enumerate(['front-right','back-left']):
        contact.paste(Image.open(P/f'{cat}-l05-{suffix}.png').resize((280,400)),(i*280,j*420))
        cd.text((i*280+8,j*420+402),f'{cat} / {suffix}',fill='#354857')
contact.save(P/'all-l05-inspection.jpg',quality=92)
lines=['# LifeCity 非住宅建筑模型交付', '',
       '30 个独立的标准 glTF 2.0 GLB；六类，每类 L1–L5。', '',
       '正门 +Z，Y 向上，底部 Y=0。以米为建模单位，常规层高 2.12，办公层高 2.32；所有顶点位于外接圆半径 4.5 的平顶正六边形地块内。模型内不含地块底座。', '',
       '每栋 8 个不透明 PBR 材质；无纹理、无外部资源、无压缩扩展。按材质合并为最多 8 个绘制图元，全部采用有厚度的封闭几何体，少量暖窗使用 emissive。', '',
       '预览由 Blender 直接导入交付 GLB 渲染。预览中的地面、相机、灯光只存在于渲染场景，不存在于 GLB。五级并排图保持相同缩放与相机角度。', '',
       '已通过项目安装版本 Three.js GLTFLoader 的 30/30 加载检查，并检查三角面、法线、几何闭合、材质、底部位置及资源依赖；详情见 validation.json。', '',
       '游戏代码及 catalog.json 均未修改。', '',
       '| 文件 | 三角面 | 材质 | 大小（字节） |','|---|---:|---:|---:|']
for row in rows:lines.append(f"| {row['file']} | {row['triangles']:,} | {row['materials']} | {row['bytes']:,} |")
(ART/'DELIVERY.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
zip_path=ART/'LifeCity-civic-buildings.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for row in rows:z.write(ROOT/row['file'],row['file'])
    for file in P.glob('*.png'):z.write(file,file.relative_to(ROOT).as_posix())
    for name in ['DELIVERY.md','model-report.json','model-report.csv','validation.json','SHA256SUMS.txt']:
        z.write(ART/name,(ART/name).relative_to(ROOT).as_posix())
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    assert len([n for n in z.namelist() if n.endswith('.glb')])==30
print(zip_path,zip_path.stat().st_size)
