"""Create REFORGED's original hard-surface rigged actors, Blender 4.5+."""
import argparse, math, sys
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.noise import noise_vector

p=argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--capture', type=Path)
cfg=p.parse_args(sys.argv[sys.argv.index('--')+1:])
root=cfg.root.resolve()
if cfg.capture:cfg.capture=cfg.capture.resolve()
sources=root/'art'/'reforged'
public=root/'public'/'reforged'
sources.mkdir(parents=True,exist_ok=True)
public.mkdir(parents=True,exist_ok=True)

def texture():
    im=bpy.data.images.new('Ceramic abrasion / original 256',256,256,alpha=True)
    rgba=[]
    for j in range(256):
        for i in range(256):
            v=noise_vector(Vector((i*.18,j*.18,.7)))[0]
            micro=.016*math.sin(i*23.1+j*17.3)
            groove=-.10 if j%64 in (0,1,2) else 0
            c=.53+.11*v+micro+groove
            rgba.extend((c*.93,c*.97,c,1))
    im.pixels.foreach_set(rgba)
    im.pack()
    return im

def material(name,color,metal,rough, emission=0, tex=None):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Metallic'].default_value=metal
    bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1)
        bs.inputs['Emission Strength'].default_value=emission
    if tex:
        node=m.node_tree.nodes.new('ShaderNodeTexImage'); node.image=tex
        m.node_tree.links.new(node.outputs['Color'],bs.inputs['Base Color'])
    return m

def rig(name,spec):
    arm=bpy.data.armatures.new(name)
    ob=bpy.data.objects.new(name,arm); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for bone,parent,head,tail in spec:
        b=arm.edit_bones.new(bone); b.head=head; b.tail=tail
        if parent:b.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    ob.select_set(False)
    for b in ob.pose.bones:b.rotation_mode='XYZ'
    return ob

def part(name,bone,section,yz,mat,bevel=.012):
    """Construct a tapered plate from profiled X/Z rings at specified heights."""
    verts=[(cx+x*w,front+(back-front)*z,height) for height,cx,w,front,back in yz for x,z in section]
    count=len(section); rings=len(yz)
    faces=[tuple(reversed(range(count)))]
    for r in range(rings-1):
        for i in range(count):
            a=r*count+i;b=r*count+(i+1)%count
            faces.append((a,b,b+count,a+count))
    faces.append(tuple(range((rings-1)*count,rings*count)))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    uv=mesh.uv_layers.new(name='Panel UV')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(v.x*2+v.y*.7,v.z*1.65+v.y*.9)
    weight=ob.vertex_groups.new(name=bone);weight.add(list(range(len(verts))),1,'REPLACE')
    if bevel:
        b=ob.modifiers.new('Manufactured bevels','BEVEL');b.width=bevel;b.segments=2
        b=ob.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return ob

octagon=[(-.70,0),(.70,0),(1,.24),(1,.76),(.70,1),(-.70,1),(-1,.76),(-1,.24)]
shield=[(-.50,0),(.50,0),(1,.31),(.76,.88),(0,1),(-.76,.88),(-1,.31)]
blade=[(0,0),(1,.32),(.65,.81),(0,1),(-.65,.81),(-1,.32)]

def build(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps=30
    tex=texture()
    shell=material('Brushed palladium composite',(.65,.67,.7),.46,.31,tex=tex)
    carbon=material('Graphite / flexible under-armour',(.038,.052,.081),.2,.53)
    cer=material('Cobalt ceramic' if name=='vesper' else 'Oxide ceramic',(.082,.29,.53) if name=='vesper' else (.45,.063,.023),.34,.34)
    lit=material('Cryocyan ion channels' if name=='vesper' else 'Infrared warning bars',(.025,.86,1) if name=='vesper' else (1,.20,.038),.12,.23,2.6)
    gold=material('Warning anodized amber',(.92,.28,.035),.28,.41)
    rootbone=('Root',None,(0,0,0),(0,0,.20))
    bones=[rootbone,('Pelvis','Root',(0,0,.83),(0,0,1.04)),('Chest','Pelvis',(0,0,1.05),(0,0,1.47)),('Head','Chest',(0,0,1.48),(0,0,1.74))]
    if name=='vesper':
        for side,k in [('L',-1),('R',1)]:
            bones += [(f'Thigh.{side}','Pelvis',(k*.145,0,.89),(k*.145,.015,.50)),
                      (f'Shin.{side}',f'Thigh.{side}',(k*.145,.015,.50),(k*.145,0,.15)),
                      (f'Foot.{side}',f'Shin.{side}',(k*.145,0,.15),(k*.145,-.19,.10)),
                      (f'Upper.{side}','Chest',(k*.27,0,1.44),(k*.36,0,1.18)),
                      (f'Fore.{side}',f'Upper.{side}',(k*.36,0,1.18),(k*.36,-.25,1.17))]
        bones += [('Weapon','Fore.R',(.36,-.22,1.17),(.36,-.62,1.17))]
    else:
        for side,k in [('L',-1),('R',1)]:
            bones += [(f'Wing.{side}','Chest',(k*.16,0,1.2),(k*.66,0,1.15)),
                      (f'Claw.{side}',f'Wing.{side}',(k*.60,0,1.15),(k*.74,-.31,.86))]
    arm=rig('VESPER // FRG-01' if name=='vesper' else 'GNAW DRONE // FRG-02',bones)
    parts=[]
    def plate(label,bone,rings,mat=carbon,shape=octagon,b=.012):
        parts.append(part(label,bone,shape,rings,mat,b))
    if name=='vesper':
        plate('Pelvic harness','Pelvis',[(.81,0,.14,-.14,.12),(.90,0,.24,-.13,.14),(1.07,0,.20,-.15,.14)],carbon)
        plate('Thoracic ceramic cuirass','Chest',[(1.00,0,.16,-.14,.15),(1.17,0,.23,-.21,.16),(1.42,0,.32,-.22,.19),(1.49,0,.19,-.14,.15)],cer,shield)
        for k in (-1,1):
            for n in range(3):
                z=1.105+n*.082
                plate(f'Chest overlapping gill {k}/{n}','Chest',[(z,k*.108,.072+n*.022,-.235,-.171),(z+.046,k*.129,.078+n*.019,-.25,-.168)],shell,blade,.007)
            plate(f'Back battery pack {k}','Chest',[(1.10,k*.13,.066,.11,.26),(1.42,k*.15,.087,.11,.32),(1.53,k*.15,.071,.12,.27)],carbon)
            plate(f'Back strip {k}','Chest',[(1.13,k*.15,.025,.26,.281),(1.45,k*.15,.025,.30,.322)],lit,blade,.003)
        plate('Diamond chest cell','Chest',[(1.20,0,.020,-.27,-.213),(1.29,0,.072,-.284,-.22),(1.37,0,.036,-.27,-.218)],lit,blade,.003)
        plate('Helmet lower jaw','Head',[(1.47,0,.063,-.11,.087),(1.55,0,.126,-.151,.115),(1.59,0,.121,-.16,.122)],carbon,shield)
        plate('Helmet ceramic crown','Head',[(1.56,0,.122,-.17,.122),(1.65,0,.132,-.17,.131),(1.75,0,.103,-.134,.10),(1.80,0,.062,-.08,.06)],shell,shield)
        plate('Visor inset','Head',[(1.575,0,.103,-.173,-.122),(1.639,0,.129,-.18,-.115),(1.654,0,.097,-.176,-.12)],carbon)
        plate('Visor continuous slit','Head',[(1.599,0,.098,-.186,-.165),(1.627,0,.122,-.19,-.16)],lit,octagon,.003)
        for side,k in [('L',-1),('R',1)]:
            plate(f'Asymmetric pauldron {side}',f'Upper.{side}',[(1.29,k*.33,.066,-.081,.10),(1.43,k*.32,.132,-.139,.12),(1.52,k*.31,.096,-.09,.085)],gold if k<0 else shell,shield)
            plate(f'Upper arm protection {side}',f'Upper.{side}',[(1.16,k*.35,.061,-.071,.07),(1.37,k*.31,.073,-.083,.08)],carbon)
            plate(f'Gauntlet {side}',f'Fore.{side}',[(1.10,k*.36,.056,-.25,.008),(1.16,k*.36,.076,-.30,.038),(1.24,k*.36,.054,-.232,.01)],cer,shield)
            plate(f'Gauntlet telemetry {side}',f'Fore.{side}',[(1.23,k*.36,.030,-.25,-.04),(1.249,k*.36,.025,-.23,-.05)],lit,blade,.004)
            plate(f'Leg undersuit {side}',f'Thigh.{side}',[(.48,k*.15,.073,-.081,.094),(.90,k*.145,.10,-.12,.101)],carbon)
            plate(f'Thigh ceramic {side}',f'Thigh.{side}',[(.54,k*.17,.074,-.117,-.02),(.78,k*.17,.111,-.132,.01),(.92,k*.161,.081,-.108,.01)],cer,shield)
            plate(f'Beveled tibia guard {side}',f'Shin.{side}',[(.13,k*.145,.062,-.10,.09),(.36,k*.145,.086,-.138,.09),(.49,k*.145,.106,-.165,.095),(.55,k*.145,.077,-.107,.08)],shell,shield)
            plate(f'Boot sole and toe {side}',f'Foot.{side}',[(.020,k*.145,.084,-.23,.081),(.078,k*.145,.101,-.23,.10),(.16,k*.145,.079,-.145,.10)],carbon)
            plate(f'Boot toe cap {side}',f'Foot.{side}',[(.064,k*.145,.086,-.25,-.109),(.123,k*.145,.084,-.205,-.096)],cer,shield)
        plate('Coil receiver','Weapon',[(1.07,.36,.045,-.60,-.18),(1.16,.36,.070,-.77,-.16),(1.25,.36,.066,-.68,-.16)],carbon)
        for n in range(5):
            y=-.70+n*.091
            plate(f'Induction cage {n}','Weapon',[(1.135,.36,.073,y,y+.032),(1.248,.36,.061,y,y+.032)],shell)
            plate(f'Induction strip {n}','Weapon',[(1.244,.36,.036,y-.024,y+.042),(1.267,.36,.027,y-.018,y+.035)],lit,blade,.004)
    else:
        plate('Keel and armour ribs','Pelvis',[(.72,0,.14,-.10,.19),(.88,0,.32,-.27,.35),(1.16,0,.34,-.33,.36)],carbon,shield)
        plate('Oxide wedge dorsal armour','Chest',[(.94,0,.27,-.40,.33),(1.22,0,.46,-.46,.48),(1.42,0,.31,-.18,.40),(1.55,0,.15,-.07,.30)],cer,blade)
        plate('Anterior sensor hood','Head',[(1.00,0,.22,-.48,-.20),(1.17,0,.30,-.49,-.14),(1.26,0,.18,-.39,-.12)],shell,shield)
        plate('Infrared sensor array','Head',[(1.08,0,.16,-.505,-.34),(1.148,0,.21,-.508,-.35)],lit,shield,.003)
        for side,k in [('L',-1),('R',1)]:
            plate(f'Armoured wing {side}',f'Wing.{side}',[(1.00,k*.45,.14,-.11,.24),(1.15,k*.54,.26,-.18,.27),(1.28,k*.47,.21,-.12,.24)],shell,blade)
            for n in range(4):
                x=k*(.38+n*.095)
                plate(f'Vent actuator {side}/{n}',f'Wing.{side}',[(1.20,x,.024,-.02,.24),(1.286,x,.019,-.02,.22)],lit if n==3 else carbon,blade,.004)
            for n in range(2):
                x=k*(.61+n*.14)
                plate(f'Razor mandible {side}/{n}',f'Claw.{side}',[(.81,x,.035,-.50,-.23),(.95,x,.070,-.45,.09),(1.13,x,.062,-.20,.16)],gold if n else cer,blade,.008)
        for n in range(5):
            y=-.02+n*.078
            plate(f'Dorsal heat fin {n}','Chest',[(1.30,0,.104,y,y+.045),(1.53,0,.093,y+.015,y+.043)],carbon,blade,.004)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts: ob.select_set(True)
    for ob in parts:
        bpy.context.view_layer.objects.active=ob
        for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
    mesh=bpy.context.object;mesh.name='Skinned plates'
    mesh.parent=arm
    deform=mesh.modifiers.new('Rig deformation','ARMATURE');deform.object=arm
    return arm

def animate(arm,name):
    clips={'Idle':61,'Run':25,'Turn':19,'Fire':16,'Recoil':12,'Hurt':20,'Special':41,'Death':55}
    for clip,end in clips.items():
        act=bpy.data.actions.new(clip)
        arm.animation_data_create()
        arm.animation_data.action=act
        for i in range(9):
            frame=1+round((end-1)*i/8)
            t=i/8; w=math.sin(t*math.tau); u=math.sin(math.pi*t)
            for b in arm.pose.bones:
                x=y=z=0; travel=(0,0,0); bone=b.name
                sign=-1 if bone.endswith('.L') else 1
                if clip=='Idle':
                    if bone=='Chest':x=w*.055
                    if bone=='Root' and name=='drone':travel=(0,.08*w,0)
                    if bone.startswith('Wing'):z=sign*.09*w
                if clip=='Run':
                    if bone.startswith('Thigh'):x=sign*.58*w
                    if bone.startswith('Shin'):x=.78*max(0,sign*w)
                    if bone.startswith('Foot'):x=-sign*.28*w
                    if bone.startswith('Upper'):x=-sign*.43*w
                    if bone.startswith('Fore'):x=.19+sign*.17*w
                    if bone=='Root': travel=(0,abs(w)*.053,0)
                    if bone=='Chest':x=.14; y=.095*w
                    if bone.startswith('Wing'):z=sign*.24*w
                    if bone.startswith('Claw'):x=.26*max(0,sign*w)
                if clip=='Turn':
                    if bone in ('Chest','Head'):y=.34*u
                    if bone.startswith('Thigh'):y=sign*.24*u; x=.18*u
                    if bone.startswith('Wing'):z=sign*.28*u
                if clip in ('Fire','Recoil'):
                    kick=math.sin(math.pi*min(1,t*2)) if t<.5 else .30*math.sin(math.pi*(t-.5)*2)
                    if bone=='Weapon': x=.32*kick; travel=(0,-.105*kick,0)
                    if bone=='Fore.R':x=-.36*kick
                    if bone=='Chest':x=-.11*kick
                    if bone.startswith('Claw'): x=.48*kick
                if clip=='Hurt':
                    if bone=='Chest':x=-.31*u;z=.21*u
                    if bone=='Head':z=.25*u
                    if bone.startswith(('Upper','Wing')):z=sign*.33*u
                if clip=='Special':
                    if bone.startswith(('Upper','Wing')):z=sign*.72*u
                    if bone.startswith(('Fore','Claw')):x=.59*u
                    if bone=='Chest': x=-.20*u
                    if bone=='Root':travel=(0,.11*u,0)
                if clip=='Death':
                    fall=max(0,(t-.16)/.84)
                    if bone=='Root':x=-1.36*fall; travel=(0,-.17*fall,.24*fall)
                    if bone=='Chest':z=.29*fall
                    if bone.startswith(('Thigh','Claw')):x=.39*fall
                    if bone.startswith(('Upper','Wing')):z=sign*.73*fall
                b.location=travel; b.rotation_euler=(x,y,z)
                b.keyframe_insert(data_path='location',frame=frame,group=bone)
                b.keyframe_insert(data_path='rotation_euler',frame=frame,group=bone)
        track=arm.animation_data.nla_tracks.new()
        track.name=clip;track.strips.new(clip,1,act);track.mute=True
        arm.animation_data.action=None
    for b in arm.pose.bones:b.location=(0,0,0);b.rotation_euler=(0,0,0)
    bpy.context.scene.frame_set(1)
    return clips

def studio(name):
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=20
    scene.render.resolution_x=850;scene.render.resolution_y=730;scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('Deep blue studio');world.use_nodes=True
    world.node_tree.nodes.get('Background').inputs[0].default_value=(.07,.11,.21,1)
    world.node_tree.nodes.get('Background').inputs[1].default_value=.3
    scene.world=world
    bpy.ops.mesh.primitive_plane_add(size=200)
    plane=bpy.context.object;plane.name='Studio ground (not exported)'
    plane.data.materials.append(material('Slate',(.031,.043,.062),.18,.67))
    aim=Vector((0,0,.94))
    for label,pos,color,power,size in [('Softbox',(2,-3,4),(.79,.90,1),450,3),('Amber rim',(-2,2,3),(1,.31,.10),550,2),('Cyan fill',(-3,-2,2),(.11,.66,1),310,2)]:
        data=bpy.data.lights.new(label,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
        ob=bpy.data.objects.new(label,data);scene.collection.objects.link(ob);ob.location=pos
        ob.rotation_euler=(aim-ob.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.objects.new('Art review / 3-quarter',bpy.data.cameras.new('Art review'))
    scene.collection.objects.link(cam);cam.location=(2.85,-5.3,2.45)
    cam.rotation_euler=(aim-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=2.65;scene.camera=cam
    scene.view_settings.view_transform='AgX'
    if cfg.capture:scene.render.filepath=str(cfg.capture/(name+'-blender.png'))

for name in ('vesper','drone'):
    arm=build(name)
    animate(arm,name)
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for ch in arm.children:ch.select_set(True)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.export_scene.gltf(filepath=str(public/(name+'.glb')),export_format='GLB',use_selection=True,
        export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_yup=True)
    # The exporter can leave its final sampled action evaluated. Restore the
    # reference pose without deleting the editable NLA tracks.
    arm.animation_data.action=None
    for track in arm.animation_data.nla_tracks:track.mute=True
    bpy.context.scene.frame_set(1)
    for b in arm.pose.bones:b.matrix_basis.identity()
    bpy.context.view_layer.update()
    studio(name)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(sources/(name+'.blend')))
    if cfg.capture:
        cfg.capture.mkdir(parents=True,exist_ok=True)
        arm.data.pose_position='REST'
        bpy.ops.render.render(write_still=True)
