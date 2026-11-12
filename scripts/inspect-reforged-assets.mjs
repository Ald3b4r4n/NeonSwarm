import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const clips = ['Idle', 'Run', 'Turn', 'Fire', 'Recoil', 'Hurt', 'Special', 'Death'];
const assets = [];
for (const id of ['vesper', 'drone']) {
  const file = new URL('../public/reforged/' + id + '.glb', import.meta.url);
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert(gltf.buffers.every(buffer => buffer.uri === undefined), 'no external buffers');
  assert(gltf.images.length >= 1 && gltf.images.every(image => image.bufferView !== undefined), 'embedded textures');
  assert(gltf.skins.length === 1 && gltf.skins[0].joints.length >= 8, 'skeletal rig');
  assert(gltf.materials.some(material => material.pbrMetallicRoughness.baseColorTexture !== undefined), 'PBR texture');
  assert(gltf.materials.some(material => material.emissiveFactor?.some(value => value > 0)), 'emissive material');
  const primitives = gltf.meshes.flatMap(mesh => mesh.primitives);
  const triangles = primitives.reduce((sum, primitive) => {
    assert(primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined);
    return sum + gltf.accessors[primitive.indices].count / 3;
  }, 0);
  assert(triangles < (id === 'vesper' ? 11000 : 4500), 'triangle budget');
  const animations = gltf.animations.map(animation => ({
    name: animation.name,
    channels: animation.channels.length,
    durationSeconds: +Math.max(...animation.samplers.map(s => gltf.accessors[s.input].max[0])).toFixed(3),
  }));
  assert.deepEqual(animations.map(animation => animation.name), clips);
  assert(animations.every(animation => animation.channels > 0 && animation.durationSeconds > .25));
  assets.push({ id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    triangles, joints: gltf.skins[0].joints.length, materials: gltf.materials.length, textures: gltf.images.length, animations });
}
console.log(JSON.stringify({ assets }, null, 2));
