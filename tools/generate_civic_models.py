"""Deterministic, closed-solid LifeCity civic architecture. No textures or dependencies."""
import math
import json
import csv
from pathlib import Path
import generate_residential_models as base

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/buildings'
ART = ROOT / 'art/buildings/civic'
CATEGORIES = ['development', 'gaming', 'office', 'learning', 'media', 'creative']
COLORS = {
    'development': ('#eee7d9', '#55adb7', '#c0cccf'),
    'gaming': ('#e8e0cc', '#d780a9', '#3d596e'),
    'office': ('#e6d9bf', '#c9ac6b', '#d5c4a4'),
    'learning': ('#eae0c9', '#8585b8', '#b6b4d0'),
    'media': ('#eee5d5', '#9680b5', '#3f566c'),
    'creative': ('#e9ddc5', '#d98a70', '#aa7950'),
}

def rgb(s):
    # glTF factors are linear, while the artist palette is sRGB.
    return [((v / 255 + .055) / 1.055) ** 2.4 if v / 255 > .04045 else v / 3294.6
            for v in bytes.fromhex(s.lstrip('#'))] + [1]

def palette(cat):
    wall, accent, secondary = COLORS[cat]
    return {
        'wall': (rgb(wall), .83, None),
        'accent': (rgb(accent), .53, None),
        'secondary': (rgb(secondary), .72, None),
        'frame': (rgb('#425a69'), .43, None),
        'glass': (rgb('#9cbfc8'), .27, None),
        'warm': (rgb('#edc585'), .48, [.13, .072, .022]),
        'stone': (rgb('#f4eddd'), .8, None),
        'leaf': (rgb('#739767'), .87, None),
    }

class Model(base.Model):
    def __init__(self, cat):
        self.triangles = {n: [] for n in palette(cat)}

    def sphere(self,material,center,radius,rings=4,segments=8):
        start=len(self.triangles[material])
        super().sphere(material,center,radius,rings,segments)
        self.triangles[material][start:]=[(a,c,b) for a,b,c in self.triangles[material][start:]]

    def bevel(self, mat, c, s, r=.045):
        """Closed bevelled cuboid: 6 faces, 12 edge quads, 8 corner triangles."""
        h = [v/2 for v in s]
        r = min(r, min(h)*.45)
        verts, faces, lookup = [], [], {}
        def idx(axis, signs):
            key = (axis, tuple(signs))
            if key not in lookup:
                lookup[key] = len(verts)
                verts.append(tuple(c[i] + signs[i]*(h[i] if i == axis else h[i]-r) for i in range(3)))
            return lookup[key]
        def face(ids, outward):
            a,b,d = [verts[i] for i in ids[:3]]
            n = base.normal(a,b,d)
            if sum(n[i]*outward[i] for i in range(3)) < 0:
                ids = list(reversed(ids))
            for k in range(1,len(ids)-1):
                faces.append((ids[0],ids[k],ids[k+1]))
        for axis in range(3):
            others = [i for i in range(3) if i != axis]
            for side in [-1,1]:
                ids=[]
                for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    signs=[0]*3; signs[axis]=side; signs[others[0]]=u; signs[others[1]]=v
                    ids.append(idx(axis, signs))
                normal=[0]*3;normal[axis]=side
                face(ids,normal)
        for a,b in [(0,1),(0,2),(1,2)]:
            free=3-a-b
            for sa in [-1,1]:
                for sb in [-1,1]:
                    signs=[0]*3; signs[a]=sa;signs[b]=sb;signs[free]=-1
                    ids=[idx(a,signs),idx(b,signs)]
                    signs[free]=1
                    ids += [idx(b,signs),idx(a,signs)]
                    n=[0]*3;n[a]=sa;n[b]=sb
                    face(ids,n)
        for x in [-1,1]:
            for y in [-1,1]:
                for z in [-1,1]:
                    signs=[x,y,z]
                    face([idx(a,signs) for a in range(3)],signs)
        self.add_triangles(mat,verts,faces)

    def cylinder(self,mat,c,r,h,n=12,axis='y'):
        pts=[]
        for yy in [-h/2,h/2]:
            for i in range(n):
                t=i*2*math.pi/n
                p=[r*math.cos(t), yy, r*math.sin(t)]
                if axis=='z':p=[p[0],p[2],p[1]]
                pts.append(tuple(c[j]+p[j] for j in range(3)))
        pts.extend([tuple(c[j]+(h/2 if j==({'y':1,'z':2}[axis]) else 0) for j in range(3)),
                    tuple(c[j]-(h/2 if j==({'y':1,'z':2}[axis]) else 0) for j in range(3))])
        faces=[]
        for i in range(n):
            q=(i+1)%n
            faces.extend([(i,n+i,n+q),(i,n+q,q),(2*n,n+q,n+i),(2*n+1,i,q)])
        if axis=='z': faces=[(a,c,b) for a,b,c in faces]
        self.add_triangles(mat,pts,faces)

def window(m,x,y,z,w=1.05,h=1.05,side=0,lit=False,div=1):
    # A shallow solid glazing volume, a perimeter frame and projecting sill.
    def b(mat,xx,yy,zz,sx,sy,sz):
        if side: m.box(mat,(z+zz*side,y+yy,x+xx),(sz,sy,sx))
        else: m.box(mat,(x+xx,y+yy,z+zz),(sx,sy,sz))
    sign=1 if side else (1 if z>0 else -1)
    b('warm' if lit else 'glass',0,0,0,w,h,.055)
    for dx in [-w/2,w/2]: b('frame',dx,0,.035*sign,.065,h+.12,.08)
    for dy in [-h/2,h/2]: b('frame',0,dy,.035*sign,w+.12,.065,.08)
    for j in range(div): b('frame',(j-(div-1)/2)*w/(div+1),0,.05*sign,.045,h,.08)
    b('stone',0,-h/2-.08,.075*sign,w+.2,.085,.24)

def planter(m,x,y,z,w=.8):
    m.bevel('secondary',(x,y+.14,z),(w,.28,.38),.025)
    for i in range(3): m.sphere('leaf',(x+(i-1)*w*.27,y+.38,z),.19,3,7)

def railing(m,x,y,z,w,d):
    for zz in [z-d/2,z+d/2]:
        m.box('frame',(x,y+.65,zz),(w,.055,.055))
        for i in range(5): m.box('frame',(x-w/2+i*w/4,y+.34,zz),(.04,.65,.04))
    for xx in [x-w/2,x+w/2]:
        m.box('frame',(xx,y+.65,z),(.055,.055,d))
        m.box('frame',(xx,y+.34,z),(.04,.65,.04))

def hvac(m,x,y,z):
    m.bevel('secondary',(x,y+.22,z),(.82,.44,.66),.045)
    for i in range(4):m.box('frame',(x-.27+i*.18,y+.455,z),(.06,.025,.5))
    m.box('stone',(x,y+.04,z),(1,.08,.82))

def entrance(m,cat,depth):
    z=depth/2
    x=.55 if cat in ['gaming','creative'] else 0
    m.bevel('frame',(x,1.02,z+.04),(1.18,1.92,.16),.035)
    for dx in [-.28,.28]:
        m.box('glass',(x+dx,1.08,z+.135),(.51,1.65,.055))
        m.box('secondary',(x+dx, .57,z+.18),(.51,.20,.035))
        m.box('stone',(x+dx*.3,1.02,z+.2),(.035,.3,.06))
    m.bevel('accent',(x,2.12,z+.39),(2.05,.17,.94),.045)
    m.bevel('stone',(x,.08,z+.33),(1.7,.16,.92),.025)
    m.bevel('stone',(x,.20,z+.17),(1.43,.08,.52),.018)
    if cat in ['development','office','learning']:
        for dx in [-.87,.87]:m.bevel('secondary',(dx,1.07,z+.47),(.12,1.95,.13),.015)
    # Two restrained entrance plants, no yard geometry.
    for dx in [-1.32,1.32]:planter(m,x+dx,0,z+.10,.48)

def pixel_sign(m,y,z,width=1.7):
    m.bevel('frame',(-.87,y,z),(width,.88,.14),.07)
    pixels=[(0,1),(1,0),(1,1),(1,2),(2,0),(2,2),(3,0),(3,1),(3,2),(4,1)]
    for a,b in pixels:
        m.box('accent' if (a+b)%3 else 'glass',(-.87+(a-2)*.23,y+(b-1)*.20,z+.087),(.17,.14,.045))

def wave_sign(m,y,z,w=2.5):
    m.bevel('secondary',(0,y,z),(w,.85,.14),.08)
    for i in range(9):
        h=.15+.44*(.5+.5*math.sin(i*1.5))
        m.bevel('accent',( (i-4)*.23,y,z+.10),(.09,h,.065),.025)

def clock(m,y,z):
    m.cylinder('accent',(0,y,z),.42,.13,16,'z')
    m.cylinder('stone',(0,y,z+.08),.34,.04,16,'z')
    for i in range(4):
        a=i*math.pi/2
        m.box('secondary',(.27*math.sin(a),y+.27*math.cos(a),z+.11),(.04,.04,.03))
    m.box('frame',(0,y+.09,z+.14),(.035,.20,.035))
    m.box('frame',(.09,y,z+.14),(.21,.035,.035))

def roof(m,cat,y,w,d,cx,cz,level):
    m.bevel('stone',(cx,y+.08,cz),(w+.16,.16,d+.16),.04)
    # Solid parapet has a visible inward roof surface; not a capped billboard.
    for z in [cz-d/2,cz+d/2]:m.bevel('secondary',(cx,y+.23,z),(w+.12,.22,.12),.025)
    for x in [cx-w/2,cx+w/2]:m.bevel('secondary',(x,y+.23,cz),(.12,.22,d),.025)
    if cat=='development':
        hvac(m,cx+.65,y+.16,cz-.65)
        m.cylinder('frame',(cx-.65,y+.60,cz-.6),.045,.9,8)
        m.sphere('stone',(cx-.65,y+.91,cz-.6),.36,4,12)
        m.cylinder('accent',(cx-.65,y+.94,cz-.6),.38,.06,12)
        if level>=3:
            for i in range(3):m.bevel('accent',(cx+.35+i*.26,y+.40,cz+.6),(.18,.40,.65),.025)
        if level==5:
            m.cylinder('stone',(cx,y+.32,cz+.2),.59,.25,12)
            m.cylinder('frame',(cx,y+.82,cz+.2),.035,.9,8)
            for dy in [.9,1.12]:m.box('accent',(cx,y+dy,cz+.2),(.86,.035,.045))
    elif cat=='gaming':
        m.bevel('secondary',(cx,y+.38,cz), (w*.58,.55,d*.53),.13)
        m.bevel('accent',(cx,y+.69,cz), (w*.6,.10,d*.55),.04)
        hvac(m,cx+.9,y+.16,cz-.75)
        if level>=3:pixel_sign(m,y+.46,cz+d*.29,1.65)
        if level==5:
            for x in [-.65,0,.65]:m.bevel('glass',(cx+x,y+.88,cz-.1),(.36,.22,.6),.04)
        # Stair-step pixel crown gives the arcade its compact graphic silhouette.
        for i in range(3):
            m.bevel('accent',(cx-w*.34+i*.25,y+.53+i*.17,cz+.1),(.25,.60+i*.34,.55),.025)
    elif cat=='office':
        hvac(m,cx+.7,y+.16,cz-.65)
        m.bevel('secondary',(cx-.6,y+.40,cz-.15),(1.15,.58,1.6),.04)
        m.bevel('accent',(cx-.6,y+.72,cz-.15),(1.24,.08,1.7),.025)
        for z in [-.55,0,.55]:m.box('frame',(cx-.6,y+.77,cz+z),(.9,.025,.06))
    elif cat=='learning':
        m.bevel('secondary',(cx,y+.28,cz),(w*.70,.30,d*.7),.04)
        # A low twelve-sided closed dome, not a residential pitched roof.
        m.sphere('accent',(cx,y+.39,cz),.72,5,12)
        m.cylinder('stone',(cx,y+.30,cz),.75,.35,12)
        for x in [-1.35,1.35]:
            if abs(x)<w/2-.25:m.bevel('glass',(cx+x,y+.24,cz),(.55,.22,1.1),.04)
        if level==5:m.cylinder('accent',(cx,y+1.10,cz),.065,.23,8)
    elif cat=='media':
        # Auditorium acoustic lantern, repeated across levels.
        for i in range(4):
            m.bevel('secondary',(cx-.9+i*.6,y+.32,cz),(.35,.42,d*.65),.04)
            m.box('accent',(cx-.9+i*.6,y+.55,cz),(.35,.055,d*.65))
        hvac(m,cx+.8,y+.16,cz-.9)
        if level==5:
            m.bevel('frame',(cx,y+.70,cz+.15),(1.4,.5,.8),.05)
            window(m,cx,y+.74,cz+.58,1.15,.26)
    else:
        # Closed sawtooth monitor roofs, characteristic of an artist workshop.
        for zz in [-.65,.42]:
            x0,x1=cx-w*.40,cx+w*.40
            z0,z1=cz+zz-.40,cz+zz+.40
            y0,y1=y+.17,y+.74
            points=[(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1),
                    (x0,y1,z0),(x1,y1,z0)]
            faces=[(0,2,1),(0,3,2),(0,1,5),(0,5,4),
                   (4,5,2),(4,2,3),(0,4,3),(1,2,5)]
            m.add_triangles('secondary',points,[(a,c,b) for a,b,c in faces])
            m.box('glass',(cx,y+.47,z0-.025),(w*.72,.40,.045))
            m.bevel('accent',(cx,y+.76,z0),(w*.83,.07,.08),.02)
        if level>=3:
            m.cylinder('stone',(cx+.8,y+.26,cz+.65),.28,.25,8)
            # Abstract balanced sculpture: stacked offset closed solids.
            m.box('accent',(cx+.8,y+.65,cz+.65),(.24,.65,.24),-.42)
            m.box('secondary',(cx+.86,y+1.03,cz+.65),(.58,.16,.20),.36)

def build(cat,level):
    m=Model(cat)
    w,d={'development':(4.7,3.7),'gaming':(5.3,3.15),'office':(4.15,4.0),
         'learning':(5.8,3.0),'media':(5.3,4.3),'creative':(5.1,3.7)}[cat]
    fh=2.32 if cat=='office' else 2.12
    for floor in range(level):
        y=floor*fh
        setback=floor>=3
        ww=w-(.85 if setback else 0)
        dd=d-(.78 if setback else 0)
        cx= -.25 if setback and cat in ['development','creative'] else 0
        cz= -.35 if setback else 0
        front=cz+dd/2; back=cz-dd/2
        main='secondary' if cat=='gaming' else 'wall'
        m.bevel(main,(cx,y+fh/2,cz),(ww,fh,dd),.28 if cat=='media' else .075)
        m.bevel('stone',(cx,y+.10,cz),(ww+.12,.20,dd+.10),.035)
        # Coherent but category-specific wall articulation.
        if cat=='development':
            for x in [-ww/2+.20,ww/2-.20]:
                m.bevel('secondary',(cx+x,y+1.12,front+.04),(.30,1.92,.15),.025)
            m.bevel('accent',(cx+ww/2-.45,y+1.07,front+.12),(.16,1.96,.12),.02)
            if floor>0:
                for x in [-1.28,0,1.15]:window(m,cx+x*.82,y+1.11,front+.04,.86,.96,lit=(floor==2 and x==0))
            else:
                for x in [-1.57,1.57]:window(m,x,1.22,front+.04,.65,.82)
        elif cat=='gaming':
            for x in [-ww/2+.15,ww/2-.15]:m.bevel('accent',(cx+x,y+1.10,front+.08),(.16,1.90,.18),.025)
            m.bevel('wall',(cx,y+1.90,front+.04),(ww-.3,.20,.16),.025)
            if floor==0:
                pixel_sign(m,1.22,front+.13)
            else:
                for x in [-1.25,0,1.25]:window(m,cx+x*.78,y+1.11,front+.04,.69,1.02,lit=floor==1 and x==0)
        elif cat=='office':
            for x in [-ww/2+.15,-.70,.70,ww/2-.15]:
                m.bevel('accent',(cx+x,y+1.05,front+.04),(.10,2.02,.15),.018)
            if floor>0:
                for x in [-1.42,0,1.42]:window(m,cx+x*(ww/w),y+1.11,front+.05,1.0*(ww/w),1.22,lit=floor==2 and x==0)
            else:
                for x in [-1.53,1.53]:window(m,x,1.15,front+.04,.75,1.12)
        elif cat=='learning':
            if floor>0:
                for x in [-1.25,1.25]:window(m,cx+x*.85,y+1.08,front+.04,1.46,1.25,div=2,lit=floor==1 and x<0)
            else:
                for x in [-1.65,1.65]:window(m,x,1.22,front+.04,1.0,1.15,div=1)
            m.bevel('accent',(cx,y+1.90,front+.06),(ww-.25,.12,.16),.025)
            for x in [-ww/2+.15,ww/2-.15]:m.bevel('secondary',(cx+x,y+1.05,front+.07),(.18,2,.18),.025)
        elif cat=='media':
            for x in [-ww/2+.25,ww/2-.25]:m.bevel('secondary',(cx+x,y+1.04,front+.09),(.42,1.96,.25),.07)
            if floor==0:wave_sign(m,2.38,front+.5,3.0)
            else:
                for x in [-1.12,1.12]:window(m,cx+x*.9,y+1.12,front+.04,1.20,.84,lit=floor==3 and x>0)
                m.bevel('accent',(cx,y+1.86,front+.10),(ww-.55,.12,.15),.025)
        else:
            for x in [-ww/2+.18,-.55,ww/2-.18]:m.bevel('secondary',(cx+x,y+1.06,front+.07),(.13,2.0,.18),.025)
            if floor==0:
                window(m,-1.30,1.15,front+.04,1.30,1.35,div=1)
                # A single geometric artwork behind the display front.
                m.box('accent',(-1.30,1.14,front+.12),(.40,.44,.06),.45)
            else:
                for x in [-1.21,.86]:window(m,cx+x*.86,y+1.08,front+.04,1.45,1.33,div=2,lit=floor==1 and x<0)
            m.bevel('accent',(cx,y+1.90,front+.08),(ww-.2,.14,.20),.025)
        # Rear service facade: continuous bay rhythm, opaque glazing, sills.
        for x in [-ww*.28,ww*.28]:
            window(m,cx+x,y+1.12,back-.04,1.05 if cat!='media' else .76,.97,lit=(floor==1 and x>0))
        for side in [-1,1]:
            for zz in [-dd*.26,dd*.26]:
                window(m,cz+zz,y+1.12,cx+side*(ww/2+.04),.85,1.1 if cat=='creative' else .92,side=side,div=1)
            if cat in ['media','creative','gaming']:
                for zz in [-dd*.42,0,dd*.42]:
                    m.bevel('secondary' if cat!='gaming' else 'accent',
                            (cx+side*(ww/2+.06),y+1.06,cz+zz),(.14,1.94,.14),.025)
        if floor==0:
            m.bevel('frame',(0,.88,back-.04),(.65,1.64,.1),.025)
            m.box('secondary',(0,.85,back-.105),(.52,1.48,.04))
            for i in range(4):m.box('frame',(.9,.65+i*.13,back-.08),(.6,.045,.10))
        if cat in ['development','office']:
            m.box('secondary',(cx+ww/2+.075,y+1.02,cz-dd*.42),(.10,2.04,.10))
        if floor==1 and level>=2:
            if cat=='development':hvac(m,1.43,fh-.05,1.62)
            if cat=='gaming':m.bevel('accent',(.50,fh+.06,front+.12),(1.4,.16,.4),.03)
            if cat=='learning':m.bevel('accent',(0,fh+.10,front+.12),(.35,.18,.32),.03)
        if floor==2 and cat in ['development','media']:m.bevel('accent',(cx,y+.18,front+.08),(ww-.12,.14,.18),.03)
    entrance(m,cat,d)
    height=level*fh
    # L4 shared terrace is preserved in L5; L5 adds a fifth occupied storey.
    if level>=4:
        terrace=3*fh+.14
        tz=d/2-.50
        m.bevel('stone',(0,terrace,tz),(w+.12,.16,1.15),.04)
        railing(m,0,terrace+.08,tz+.14,w-.15,.64)
        for x in [-w/2+.45,w/2-.45]:planter(m,x,terrace+.08,tz+.13,.58)
        if cat in ['gaming','creative','learning']:
            for x in [-.68,.68]:m.bevel('secondary',(x,terrace+.32,tz+.10),(.64,.35,.36),.04)
        if level==5:
            # A category-specific shared top pavilion, within the inherited roof.
            if cat in ['office','learning','creative']:
                for x in [-1.35,1.35]:m.box('secondary',(x,height-.2,1.10),(.07,.72,.07))
                for x in [-1.40,-.70,0,.70,1.40]:m.box('accent',(x,height+.16,1.04),(.09,.09,.74))
            if cat=='gaming':pixel_sign(m,height-.80,d/2-.67)
            if cat=='media':wave_sign(m,height-.70,d/2-.67)
    ww=w-(.85 if level>=4 else 0);dd=d-(.78 if level>=4 else 0)
    cx=-.25 if level>=4 and cat in ['development','creative'] else 0
    cz=-.35 if level>=4 else 0
    roof(m,cat,height,ww,dd,cx,cz,level)
    if cat=='development':
        # Persistent service spine and higher laboratory penthouse on the right.
        tx=cx+ww/2+.14
        m.bevel('secondary',(tx,height/2+.15,-.75),(.68,height+.30,1.45),.06)
        m.bevel('accent',(tx,height+.35,-.75),(.78,.16,1.56),.03)
        for floor in range(level):
            window(m,-.75,floor*fh+1.15,tx+.37,.68,.8,side=1)
        if level>=4:
            m.bevel('stone',(cx-.75,height+.22,-.15),(1.45,.25,1.35),.04)
            railing(m,cx-.75,height+.36,-.15,1.35,1.24)
    if cat=='learning':
        m.bevel('stone',(0,height+.40,cz+dd/2+.02),(1.12,.91,.24),.07)
        clock(m,height+.43,cz+dd/2+.20)
    # Every coordinate must lie inside a regular, flat-top hex, circumradius 4.5.
    verts=[p for tris in m.triangles.values() for tri in tris for p in tri]
    for x,y,z in verts:
        assert y>=-1e-6, (cat,level,'below ground',y)
        assert abs(z)<=math.sqrt(3)*4.5/2+1e-6
        assert math.sqrt(3)*abs(x)+abs(z)<=math.sqrt(3)*4.5+1e-6,(cat,level,x,z)
    return m

def main():
    ART.mkdir(parents=True,exist_ok=True)
    rows=[]
    for cat in CATEGORIES:
        base.MATERIALS=palette(cat)
        for level in range(1,6):
            model=build(cat,level)
            path=OUT/cat/f'{cat}-l{level:02d}.glb'
            stats=base.export_glb(model,path,level)
            # Replace residential labels in the glTF JSON without touching binary.
            import struct
            data=path.read_bytes();jl=struct.unpack_from('<I',data,12)[0]
            doc=json.loads(data[20:20+jl]);doc['asset']['generator']='LifeCity Civic Solid Modeler 1.0'
            name=f'{cat}_L{level:02d}'
            for key in ['scenes','nodes','meshes']:doc[key][0]['name']=name
            doc['nodes'][0]['extras']={'category':cat,'level':level,'front':'+Z','up':'+Y','hexCircumradius':4.5,'floorHeight':2.32 if cat=='office' else 2.12}
            payload=json.dumps(doc,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4)
            chunk=data[20+jl:]
            path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(payload)+len(chunk))+struct.pack('<I4s',len(payload),b'JSON')+payload+chunk)
            coords=[p for ts in model.triangles.values() for t in ts for p in t]
            rows.append({'file':path.relative_to(ROOT).as_posix(),'triangles':stats['triangles'],
                         'materials':8,'bytes':path.stat().st_size,
                         'bounds_min':[round(min(p[i] for p in coords),5) for i in range(3)],
                         'bounds_max':[round(max(p[i] for p in coords),5) for i in range(3)]})
            print(cat,level,stats['triangles'],path.stat().st_size,flush=True)
    (ART/'model-report.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    with (ART/'model-report.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=['file','triangles','materials','bytes']);writer.writeheader()
        writer.writerows({k:r[k] for k in writer.fieldnames} for r in rows)

if __name__=='__main__':main()
