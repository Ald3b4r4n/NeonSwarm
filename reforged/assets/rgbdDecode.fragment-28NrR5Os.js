import{S as e}from"./scene-vcTBcZ7L.js";import{h as n}from"./helperFunctions-C1zbAHOZ.js";import"./index-Bfv1eKoD.js";const o="rgbdDecodePixelShader",t=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=vec4(fromRGBD(texture2D(textureSampler,vUV)),1.0);}`;e.ShadersStore[o]||(e.ShadersStore[o]=t);const a=[n];for(const r of a)e.IncludesShadersStore[r.name]||(e.IncludesShadersStore[r.name]=r.shader);const S={name:o,shader:t};export{S as rgbdDecodePixelShader};
