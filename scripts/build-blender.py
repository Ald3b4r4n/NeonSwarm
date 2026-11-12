"""Create editable original models and render Canvas animation frames with Blender."""
import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = argparse.ArgumentParser()
args.add_argument("--root", type=Path, required=True)
args.add_argument("--only")
cfg = args.parse_args(sys.argv[sys.argv.index("--") + 1:])
source = cfg.root / "art" / "blender"
frames = cfg.root / ".hivemind" / "blender-frames"
source.mkdir(parents=True, exist_ok=True)
frames.mkdir(parents=True, exist_ok=True)
TAU = math.tau
DARK = (0.035, .06, .092, 1)
STEEL = (.24, .32, .42, 1)
BONE = (.76, .69, .55, 1)
CYAN = (.07, .9, 1, 1)
ORANGE = (1, .28, .04, 1)
PINK = (1, .055, .37, 1)
PURPLE = (.42, .11, .8, 1)
LIME = (.45, .92, .13, 1)
material_cache = {}

def color(obj, rgba):
    material = material_cache.get(rgba)
    if material is None:
        material = bpy.data.materials.new("Finish %02d" % len(material_cache))
        material.diffuse_color = rgba
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = rgba
        shader.inputs["Metallic"].default_value = .45
        shader.inputs["Roughness"].default_value = .32
        material_cache[rgba] = material
    obj.data.materials.append(material)
    obj.color = rgba

def part(name, pos, scale, rgba, parent=None, primitive="ico", tilt=0):
    if primitive == "cube":
        bpy.ops.mesh.primitive_cube_add(size=2)
    elif primitive == "ring":
        bpy.ops.mesh.primitive_torus_add(major_segments=20, minor_segments=7, major_radius=1, minor_radius=.12)
    else:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if primitive=="smooth" else 1, radius=1)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = pos
    obj.scale = scale
    obj.rotation_euler.y = tilt
    color(obj, rgba)
    return obj

def link(name, start, end, width, rgba, parent):
    a, b = Vector(start), Vector(end)
    obj = part(name, (a+b)*.5, (width, width, (a-b).length*.62), rgba, parent, "smooth")
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (b-a).to_track_quat("Z", "Y")
    return obj

def pivot(name, pos, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = pos
    return obj

def character(root, name, glow):
    hips = pivot("Pelvis rig", (0, 0, .91), root)
    part("Armor torso", (0, 0, .43), (.41, .26, .49), STEEL if name=="vesper" else (.51,.22,.075,1), hips, "smooth")
    part("Reactor pack", (0, .2, .53), (.32,.18,.39), DARK, hips)
    part("Reactor cells", (0,.33,.6), (.15,.12,.29), glow, hips)
    part("Chest crest", (0,-.245,.48), (.27,.065,.26), glow, hips)
    part("Belt plate", (0,-.07,.03), (.34,.23,.16), DARK, hips)
    for i in [-1,1]:
        part("Belt capsule", (.23*i,-.19,.05), (.09,.08,.11), ORANGE, hips)
    part("Helmet shell", (0,-.025,1.01), (.285,.27,.32), BONE if name=="vesper" else (.61,.28,.095,1), hips, "smooth")
    part("Helmet visor", (0,-.239,1.01), (.242,.075,.128), DARK, hips, "smooth")
    part("Visor slit", (0,-.302,1.03), (.185,.024,.041), glow, hips)
    if name=="vesper":
        for i in range(4):
            part("Ivory swept crest", (-.21+i*.107,.025,1.25+i*.015), (.11,.24,.10), BONE, hips, tilt=.4)
    else:
        for side in [-1,1]:
            part("Mask mandible", (.19*side,-.23,.88), (.094,.095,.18), STEEL, hips)
    limbs=[]
    for side in [-1,1]:
        leg = pivot("Left leg" if side<0 else "Right leg", (.23*side,0,-.04), hips)
        link("Upper leg", (0,0,0), (.04*side,-.07,-.43), .16, STEEL, leg)
        link("Armored greave", (.04*side,-.07,-.42), (.04*side,.02,-.78), .13, DARK, leg)
        part("Knee plate", (.04*side,-.15,-.41), (.14,.11,.15), glow, leg)
        part("Boot", (.04*side,-.11,-.79), (.15,.29,.11), STEEL, leg, "smooth")
        arm = pivot("Shoulder", (.39*side,0,.63), hips)
        part("Pauldron", (0,0,0), (.235,.27,.195), STEEL, arm)
        part("Shoulder light", (0,-.22,0), (.15,.058,.09), glow, arm)
        link("Forearm", (0,0,0), (.02*side,-.38,-.28), .145, DARK, arm)
        part("Gauntlet", (.02*side,-.36,-.27), (.127,.16,.13), STEEL, arm)
        limbs.append((leg,arm))
    gun = pivot("Weapon rig", (.22,-.4,.5), hips)
    part("Rifle housing", (0,-.26,0), (.19,.44,.18), DARK, gun, "cube")
    part("Rifle plate", (0,-.22,.145), (.16,.32,.055), STEEL, gun)
    for i in range(3):
        part("Emitter cell", (0,-.39-.12*i,0), (.17,.075,.15), glow, gun, "smooth")
    part("Muzzle", (0,-.77,0), (.11,.16,.11), STEEL, gun, "cube")
    return hips, limbs, gun

def creature(root, name, glow):
    queen = name=="queen"
    heavy = name in {"brute","queen","elite"}
    floating = name in {"spore","shooter"}
    mass = 1.32 if queen else 1 if heavy else .77
    z = .94 if heavy else .7
    body = pivot("Chitin rig", (0,0,z), root)
    part("Carapace", (0,.09,0), (.65*mass,.9*mass,.5*mass), DARK, body, "smooth")
    for i in range(4):
        part("Layered chitin", (0,.47-i*.27,.17+i*.021), (.63*mass,.27,.39*mass), glow if i==0 else STEEL, body, "smooth")
    part("Mask", (0,-.73,-.14), (.41*mass,.39,.32), BONE if heavy else STEEL, body, "smooth")
    for side in [-1,1]:
        part("Eye cluster", (.18*side*mass,-1.025,-.1), (.128,.075,.085), glow, body)
        link("Jaw blade", (.26*side,-.7,-.1), (.48*side,-1.26,-.35), .108, BONE, body)
        if floating:
            part("Spore sac" if name=="spore" else "Accelerator", (.58*side,.11,.12), (.32,.44,.27), glow, body, "smooth")
    limbs=[]
    count=4 if queen else 3 if heavy else 2
    for side in [-1,1]:
        for i in range(count):
            y=.58-i*.44
            leg=pivot("Articulated leg", (.44*side*mass,y,-.12), body)
            knee=(.6*side*mass,y*.25,.23 if heavy else -.03)
            foot=(.94*side*mass,y*.56,-z+.06)
            link("Upper armor", (0,0,0), knee, .147 if heavy else .106, STEEL, leg)
            part("Joint", knee, (.145,.155,.148), glow, leg)
            link("Scythe", knee, foot, .115 if heavy else .086, BONE if heavy else DARK, leg)
            limbs.append((leg,None))
    gun=pivot("Attack mount",(0,-.18,.46),body)
    if queen:
        part("Crown", (0,-.39,.25), (.46,.36,.45), BONE, gun)
        for side in [-1,1]:
            link("Crown horn", (.2*side,-.3,.2), (.75*side,.2,.71), .16, BONE, gun)
        part("Queen core", (0,-.63,.12), (.21,.19,.28), glow, gun, "smooth")
    elif name=="shooter":
        for side in [-1,1]:
            part("Ranged barrel", (.34*side,-.23,.09), (.14,.47,.13), glow, gun, "cube")
    elif name=="elite":
        for side in [-1,1]:
            link("Elite scythe", (.33*side,-.22,0), (.95*side,-.95,.17), .15, glow, gun)
    return body, limbs, gun

PALETTES = {"vesper":CYAN,"rook":ORANGE,"drone":CYAN,"brute":PURPLE,
            "shooter":PINK,"spore":LIME,"hound":ORANGE,"elite":PURPLE,"queen":PINK}
CLIPS = ("idle","move","attack","hurt","death","special")
COUNT = 4

def configure():
    scene=bpy.context.scene
    scene.render.engine="BLENDER_WORKBENCH"
    scene.render.film_transparent=True
    scene.render.resolution_x=128
    scene.render.resolution_y=128
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format="PNG"
    scene.render.image_settings.color_mode="RGBA"
    scene.display.render_aa="5"
    shading=scene.display.shading
    shading.light="STUDIO"
    shading.color_type="MATERIAL"
    shading.show_shadows=False
    shading.show_cavity=True
    shading.cavity_type="BOTH"
    shading.curvature_ridge_factor=1.48
    shading.curvature_valley_factor=1.1
    shading.show_specular_highlight=True
    shading.show_object_outline=True
    shading.object_outline_color=(.013,.019,.028)
    bpy.ops.object.camera_add(location=(0,-6.9,8.4))
    camera=bpy.context.object
    camera.rotation_euler=(Vector((0,0,.83))-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO"
    scene.camera=camera
    return scene, camera

def animate(root, body, limbs, gun, glow, player, queen):
    base_z=body.location.z
    flash=part("Attack flash",(0,-.93,0),(.12,.2,.13),glow,gun)
    for row,clip in enumerate(CLIPS + (("arrival", "charge") if queen else ())):
        for i in range(COUNT):
            frame=row*COUNT+i+1
            wave=math.sin(i*TAU/COUNT)
            bump=math.sin(i*math.pi/(COUNT-1))
            t=i/(COUNT-1)
            root.rotation_euler=(0,0,0)
            root.scale=(1,1,1)
            body.location.z=base_z+(.055 if clip=="move" else .035)*wave
            body.rotation_euler=(0,0,0)
            gun.location.y=-.4 if player else -.18
            gun.rotation_euler=(0,0,0)
            strength=0
            if clip=="attack":
                gun.location.y+=.22*bump
                body.rotation_euler.x=.13*bump
                strength=bump
            elif clip=="hurt":
                body.rotation_euler.y=.27*bump
                body.location.z+=.13*bump
            elif clip=="death":
                root.rotation_euler.y=1.28*t
                root.scale=(1-.28*t,1-.28*t,1-.28*t)
            elif clip=="special":
                body.location.z+=.29*bump
                gun.rotation_euler.z=.52*wave
                strength=bump*1.5
            elif clip=="arrival":
                body.location.z+=.75*(1-t)
                root.scale=(.72+.28*t, .72+.28*t, .72+.28*t)
                body.rotation_euler.z=.32*(1-t)
            elif clip=="charge":
                body.location.z-=.21*bump
                gun.rotation_euler.x=-.38*bump
                strength=.45+bump*.75
            flash.scale=(strength*.25,strength*.34,strength*.21)
            for j,(leg,arm) in enumerate(limbs):
                swing=math.sin(i*TAU/COUNT+j*math.pi*.79)
                leg.rotation_euler.x=(.42 if player else .27)*swing if clip=="move" else .07*swing
                leg.rotation_euler.y=(.16 if queen else .06)*swing if clip=="special" else 0
                leg.keyframe_insert(data_path="rotation_euler",frame=frame)
                if arm:
                    arm.rotation_euler.x=.21*swing if clip=="move" else -.21*bump if clip=="attack" else 0
                    arm.keyframe_insert(data_path="rotation_euler",frame=frame)
            for obj,paths in [(root,("rotation_euler","scale")),(body,("location","rotation_euler")),
                              (gun,("location","rotation_euler")),(flash,("scale",))]:
                for path in paths:
                    obj.keyframe_insert(data_path=path,frame=frame)

for name,glow in PALETTES.items():
    if cfg.only and name != cfg.only:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material_cache.clear()
    scene,camera=configure()
    camera.data.ortho_scale=4.15 if name=="queen" else 3.48 if name in {"vesper","rook","brute","elite"} else 3.05
    root=pivot(name.upper(),(0,0,0))
    player=name in {"vesper","rook"}
    body,limbs,gun=character(root,name,glow) if player else creature(root,name,glow)
    animate(root,body,limbs,gun,glow,player,name=="queen")
    clips = CLIPS + (("arrival", "charge") if name=="queen" else ())
    scene.frame_end=len(clips)*COUNT
    for row,clip in enumerate(clips):
        scene.timeline_markers.new(clip,frame=row*COUNT+1)
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source / (name+".blend")))
    for frame in range(1,scene.frame_end+1):
        scene.frame_set(frame)
        scene.render.filepath=str(frames / f"{name}-{frame:02d}.png")
        bpy.ops.render.render(write_still=True)



for name, glow in (("station-prop", CYAN), ("nursery-prop", PINK)):
    if cfg.only and name != cfg.only and cfg.only != "props":
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material_cache.clear()
    scene, camera = configure()
    camera.data.ortho_scale = 3.0
    root = pivot(name, (0, 0, .19))
    part("Socket", (0,0,.04), (.79,.79,.17), DARK, root, "smooth")
    part("Industrial flange", (0,0,.28), (.72,.72,.20), STEEL, root, "ring")
    core = pivot("Powered rotor", (0,0,.45), root)
    part("Core", (0,0,.18), (.46,.46,.50), glow, core, "smooth")
    for i in range(5):
        angle = i * TAU / 5
        x,y = math.cos(angle),math.sin(angle)
        link("Cage strut", (.67*x,.67*y,.10), (.34*x,.34*y,.54), .083, BONE if name=="nursery-prop" else STEEL, root)
        part("Rotor vane", (.34*x,.34*y,.16), (.17,.16,.10), glow, core)
    scene.frame_end = 4
    for i in range(4):
        core.rotation_euler.z = TAU*i/4
        core.scale.z = 1 + .12 * math.sin(i*TAU/4)
        core.keyframe_insert(data_path="rotation_euler", frame=i+1)
        core.keyframe_insert(data_path="scale", frame=i+1)
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(source/(name+".blend")))
    for frame in range(1,5):
        scene.frame_set(frame)
        scene.render.filepath=str(frames/f"{name}-{frame:02d}.png")
        bpy.ops.render.render(write_still=True)