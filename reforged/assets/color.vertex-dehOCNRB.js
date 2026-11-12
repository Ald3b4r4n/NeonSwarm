import{S as e}from"./scene-vcTBcZ7L.js";import{b as r,a as t,i as a,c as d,d as c}from"./bakedVertexAnimation-DHXf3KoS.js";import{c as l,a as s}from"./clipPlaneVertex-DkzhF6qF.js";import{f,a as V}from"./fogVertex-B0BFz0cz.js";import{i as m}from"./instancesDeclaration-Zlt2ygMw.js";import{v as x}from"./vertexColorMixing-DbTAkFSA.js";import"./index-Bfv1eKoD.js";const o="colorVertexShader",n=`attribute vec3 position;
#ifdef VERTEXCOLOR
attribute vec4 color;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#ifdef FOG
uniform mat4 view;
#endif
#include<instancesDeclaration>
uniform mat4 viewProjection;
#ifdef MULTIVIEW
uniform mat4 viewProjectionR;
#endif
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vec4 vColor;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
#ifdef VERTEXCOLOR
vec4 colorUpdated=color;
#endif
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(position,1.0);
#ifdef MULTIVIEW
if (gl_ViewID_OVR==0u) {gl_Position=viewProjection*worldPos;} else {gl_Position=viewProjectionR*worldPos;}
#else
gl_Position=viewProjection*worldPos;
#endif
#include<clipPlaneVertex>
#include<fogVertex>
#include<vertexColorMixing>
#define CUSTOM_VERTEX_MAIN_END
}`;e.ShadersStore[o]||(e.ShadersStore[o]=n);const S=[r,t,l,f,m,a,d,c,s,V,x];for(const i of S)e.IncludesShadersStore[i.name]||(e.IncludesShadersStore[i.name]=i.shader);const T={name:o,shader:n};export{T as colorVertexShader};
