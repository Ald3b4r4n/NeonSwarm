import{S as e}from"./scene-vcTBcZ7L.js";import{k as d}from"./kernelBlurVaryingDeclaration-E22v-pSh.js";import"./index-Bfv1eKoD.js";const n="kernelBlurVertex",t="sampleCoord{X}=sampleCenter+delta*KERNEL_OFFSET{X};";e.IncludesShadersStore[n]||(e.IncludesShadersStore[n]=t);const s={name:n,shader:t},o="kernelBlurVertexShader",a=`attribute vec2 position;uniform vec2 delta;varying vec2 sampleCenter;
#include<kernelBlurVaryingDeclaration>[0..varyingCount]
const vec2 madd=vec2(0.5,0.5);
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
sampleCenter=(position*madd+madd);
#include<kernelBlurVertex>[0..varyingCount]
gl_Position=vec4(position,0.0,1.0);
#define CUSTOM_VERTEX_MAIN_END
}`;e.ShadersStore[o]||(e.ShadersStore[o]=a);const i=[d,s];for(const r of i)e.IncludesShadersStore[r.name]||(e.IncludesShadersStore[r.name]=r.shader);const m={name:o,shader:a};export{m as kernelBlurVertexShader};
