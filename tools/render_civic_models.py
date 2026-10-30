"""Blender-only inspection render. Cameras, lights and floor never enter the GLBs."""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'art/buildings/civic/previews'
OUT.mkdir(parents=True,exist_ok=True)
CATS=['development','gaming','office','learning','media','creative']
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if args:CATS=[args[0]]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=700;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world.color=(.28,.28,.28)
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
world=scene.world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.78,.85,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.018))
floor=bpy.context.object;floor.name='Preview_only_ground'
mat=bpy.data.materials.new('Preview_only_ground');mat.diffuse_color=(.78,.76,.70,1);floor.data.materials.append(mat)
def area(name,loc,power,size):
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Preview_key',(-9,-12,19),2300,9)
area('Preview_fill',(10,-4,11),1100,8)
area('Preview_rim',(1,8,17),1800,7)
bpy.ops.object.camera_add()
cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=15.7
def camera(back=False):
    target=Vector((0,0,5.5))
    cam.location=target+Vector((-18,26,18) if back else (18,-26,18))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
camera()
for cat in CATS:
    for level in range(1,6):
        existing=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT/f'public/models/buildings/{cat}/{cat}-l{level:02d}.glb'))
        imported=list(set(bpy.data.objects)-existing)
        for back in ([False,True] if level==5 else [False]):
            camera(back)
            suffix='back-left' if back else 'front-right'
            scene.render.filepath=str(OUT/f'{cat}-l{level:02d}-{suffix}.png')
            bpy.ops.render.render(write_still=True)
            print('RENDERED',scene.render.filepath,flush=True)
        for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
