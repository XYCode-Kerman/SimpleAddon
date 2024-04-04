// __multiversion__
// This signals the loading code to prepend either #version 100 or #version 300 es as apropriate.

#include "shaders/fragmentVersionCentroidUV.h"
#include "shaders/uniformEntityConstants.h"
#include "shaders/uniformPerFrameConstants.h"

#if !defined(TEXEL_AA) || !defined(TEXEL_AA_FEATURE)
#  define USE_TEXEL_AA 0
#else
#  define USE_TEXEL_AA 1
#endif

#ifdef ALPHA_TEST
#  define USE_ALPHA_TEST 1
#else
#  define USE_ALPHA_TEST 0
#endif

#if __VERSION__ >= 300

#  ifndef _UNIFORM_SHADER_CONSTANTS_H
#    define _UNIFORM_SHADER_CONSTANTS_H

#    ifdef MCPE_PLATFORM_NX
#      extension GL_ARB_enhanced_layouts : enable
layout(binding = 3) uniform ShaderConstants {
#    endif
  // BEGIN_UNIFORM_BLOCK(ShaderConstants) - unfortunately this macro does not work on old Amazon platforms so using above 3 lines instead
  UNIFORM vec4 CURRENT_COLOR;
  UNIFORM vec4 DARKEN;
  UNIFORM vec3 TEXTURE_DIMENSIONS;
  UNIFORM float HUD_OPACITY;
  UNIFORM MAT4 UV_TRANSFORM;
  END_UNIFORM_BLOCK

#  endif

#  if USE_TEXEL_AA

  const float TEXEL_AA_LOD_CONSERVATIVE = -1.0;
  const float TEXEL_AA_LOD_RELAXED = 2.0;

  vec4 texture2D_AA(in sampler2D source, in highp vec2 originalUV) {

    highp vec2 dUV_dX = dFdx(originalUV) * TEXTURE_DIMENSIONS.xy;
    highp vec2 dUV_dY = dFdy(originalUV) * TEXTURE_DIMENSIONS.xy;

    highp vec2 delU = vec2(dUV_dX.x, dUV_dY.x);
    highp vec2 delV = vec2(dUV_dX.y, dUV_dY.y);
    highp vec2 adjustmentScalar = max(1.0 / vec2(length(delU), length(delV)), 1.0);

    highp vec2 fractionalTexel = fract(originalUV * TEXTURE_DIMENSIONS.xy);
    highp vec2 adjustedFractionalTexel = clamp(fractionalTexel * adjustmentScalar, 0.0, 0.5) + clamp(fractionalTexel * adjustmentScalar - (adjustmentScalar - 0.5), 0.0, 0.5);

    highp float lod = log2(sqrt(max(dot(dUV_dX, dUV_dX), dot(dUV_dY, dUV_dY))) * 2.0);
    highp float samplingMode = smoothstep(TEXEL_AA_LOD_RELAXED, TEXEL_AA_LOD_CONSERVATIVE, lod);

    highp vec2 adjustedUV = (adjustedFractionalTexel + floor(originalUV * TEXTURE_DIMENSIONS.xy)) / TEXTURE_DIMENSIONS.xy;
    lowp vec4 blendedSample = texture2D(source, mix(originalUV, adjustedUV, samplingMode));

#    if USE_ALPHA_TEST
    return vec4(blendedSample.rgb, mix(blendedSample.a, smoothstep(1.0 / 2.0, 1.0, blendedSample.a), samplingMode));
#    else
  return blendedSample;
#    endif
  }

#  endif // USE_TEXEL_AA

#endif //__VERSION__ >= 300

  LAYOUT_BINDING(0) uniform sampler2D TEXTURE_0;
  LAYOUT_BINDING(1) uniform sampler2D TEXTURE_1;

#if defined(GLINT) && defined(USE_BLOOM)
#  define GLINT_BLEND_BLOOM
#endif

#if defined(USE_MULTITEXTURE) || defined(GLINT_BLEND_BLOOM)
  LAYOUT_BINDING(2) uniform sampler2D TEXTURE_2;
#endif

  varying vec4 light;
  varying vec4 fogColor;

#ifdef COLOR_BASED
  varying vec4 vertColor;
#endif

#ifdef USE_OVERLAY
  // When drawing horses on specific android devices, overlay color ends up being garbage data.
  // Changing overlay color to high precision appears to fix the issue on devices tested
  varying highp vec4 overlayColor;
#endif

#ifdef TINTED_ALPHA_TEST
  varying float alphaTestMultiplier;
#endif

#ifdef GLINT
  varying vec2 layer1UV;
  varying vec2 layer2UV;
  varying vec4 tileLightColor;
  varying vec4 glintColor;
#endif

  vec4 glintBlend(vec4 dest, vec4 source) {
    // glBlendFuncSeparate(GL_SRC_COLOR, GL_ONE, GL_ONE, GL_ZERO)
    return vec4(source.rgb * source.rgb, source.a) + vec4(dest.rgb, 0.0);
  }

#ifdef USE_EMISSIVE
#  ifdef USE_ONLY_EMISSIVE
#    define NEEDS_DISCARD(C) (C.a == 0.0 || C.a == 1.0)
#  else
#    define NEEDS_DISCARD(C) (C.a + C.r + C.g + C.b == 0.0)
#  endif
#else
#  ifndef USE_COLOR_MASK
#    define NEEDS_DISCARD(C) (C.a < 0.5)
#  else
#    define NEEDS_DISCARD(C) (C.a == 0.0)
#  endif
#endif

#if defined(USE_ALPHA) || defined(USE_BRIGHT)
  uniform vec4 HIDE_COLOR;
#endif

  void main() {
    vec4 color = vec4(1.0);

#ifdef USE_BLOOM
    vec4 bloomMask = vec4(1.0);
#endif

#ifndef NO_TEXTURE
#  if !defined(TEXEL_AA) || !defined(TEXEL_AA_FEATURE)
    color = texture2D(TEXTURE_0, uv);
#    ifdef USE_BLOOM
#      ifdef GLINT_BLEND_BLOOM
    bloomMask = texture2D(TEXTURE_2, uv);
#      else
    bloomMask = texture2D(TEXTURE_1, uv);
#      endif
#    endif
#  else
  color = texture2D_AA(TEXTURE_0, uv);
#    ifdef USE_BLOOM
#      ifdef GLINT_BLEND_BLOOM
  bloomMask = texture2D_AA(TEXTURE_2, uv);
#      else
  bloomMask = texture2D_AA(TEXTURE_1, uv);
#      endif
#    endif
#  endif // !defined(TEXEL_AA) || !defined(TEXEL_AA_FEATURE)

#  ifdef MASKED_MULTITEXTURE
    vec4 tex1 = texture2D(TEXTURE_1, uv);

    // If tex1 has a non-black color and no alpha, use color; otherwise use tex1
    float maskedTexture = ceil(dot(tex1.rgb, vec3(1.0, 1.0, 1.0)) * (1.0 - tex1.a));
    color = mix(tex1, color, clamp(maskedTexture, 0.0, 1.0));
#  endif // MASKED_MULTITEXTURE

#  if defined(ALPHA_TEST) && !defined(USE_MULTITEXTURE) && !defined(MULTIPLICATIVE_TINT)
    if (NEEDS_DISCARD(color))
      discard;
#  endif // ALPHA_TEST

#  ifdef TINTED_ALPHA_TEST
    vec4 testColor = color;
    testColor.a *= alphaTestMultiplier;
    if (NEEDS_DISCARD(testColor))
      discard;
#  endif // TINTED_ALPHA_TEST
#endif   // NO_TEXTURE

#ifdef COLOR_BASED
    color *= vertColor;
#endif
#ifdef CUSTOM
    // 使用alpha分段处理
    if (color.a < 0.51) {
      // color.a *= 2.0;
      color = vec4(color.rgb, color.a * 2.0);
    } else {
      float seed = sin(TIME * 2.0 + (color.a - 0.5) * 10.0) * 0.2 + 0.2;
      color = vec4(color.rgb + seed, 1.0);
    }
#endif // CUSTOM
#ifdef MULTI_COLOR_TINT
    // Texture is a mask for tinting with two colors
    vec2 colorMask = color.rg;

    // Apply the base color tint
    color.rgb = colorMask.rrr * CHANGE_COLOR.rgb;

    // Apply the secondary color mask and tint so long as its grayscale value is not 0
    color.rgb = mix(color, colorMask.gggg * MULTIPLICATIVE_TINT_CHANGE_COLOR, ceil(colorMask.g)).rgb;
#else

#  ifdef USE_COLOR_MASK
  color.rgb = mix(color.rgb, color.rgb * CHANGE_COLOR.rgb, color.a);
  color.a *= CHANGE_COLOR.a;
#  endif

#  ifdef ITEM_IN_HAND
  color.rgb = mix(color.rgb, color.rgb * CHANGE_COLOR.rgb, vertColor.a);
#    if defined(MCPE_PLATFORM_NX) && defined(NO_TEXTURE) && defined(GLINT)
  // TODO(adfairfi): This needs to be properly fixed soon. We have a User Story for it in VSO: 102633
  vec3 dummyColor = texture2D(TEXTURE_0, vec2(0.0, 0.0)).rgb;
  color.rgb += dummyColor * 0.000000001;
#    endif
#  endif // MULTI_COLOR_TINT

#endif

#ifdef USE_MULTITEXTURE
    vec4 tex1 = texture2D(TEXTURE_1, uv);
    vec4 tex2 = texture2D(TEXTURE_2, uv);
    color.rgb = mix(color.rgb, tex1.rgb, tex1.a);
#  ifdef ALPHA_TEST
    if (color.a < 0.5 && tex1.a == 0.0) {
      discard;
    }
#  endif

#  ifdef COLOR_SECOND_TEXTURE
    if (tex2.a > 0.0) {
      color.rgb = tex2.rgb + (tex2.rgb * CHANGE_COLOR.rgb - tex2.rgb) * tex2.a; // lerp(tex2.rgb, tex2 * changeColor.rgb, tex2.a)
    }
#  else
  color.rgb = mix(color.rgb, tex2.rgb, tex2.a);
#  endif
#endif

#ifdef MULTIPLICATIVE_TINT
    vec4 tintTex = texture2D(TEXTURE_1, uv);
#  ifdef MULTIPLICATIVE_TINT_COLOR
    tintTex.rgb = tintTex.rgb * MULTIPLICATIVE_TINT_CHANGE_COLOR.rgb;
#  endif

#  ifdef ALPHA_TEST
    color.rgb = mix(color.rgb, tintTex.rgb, tintTex.a);
    if (color.a + tintTex.a <= 0.0) {
      discard;
    }
#  endif

#endif

#ifdef USE_OVERLAY
    // use either the diffuse or the OVERLAY_COLOR
    color.rgb = mix(color, overlayColor, overlayColor.a).rgb;
#endif

#ifdef USE_BLOOM
    // bloom overrides emissive
    color.rgb *= (bloomMask.r < 0.1) ? light.rgb : vec3(bloomMask.r);
#else
#  ifdef USE_EMISSIVE
  // make glowy stuff
  color *= mix(vec4(1.0), light, color.a);
#  else
#    ifdef USE_LIGHT
  color *= light;
#    else
  //color *= 1.;
#    endif
#  endif
#endif

    // apply fog
    color.rgb = mix(color.rgb, fogColor.rgb, fogColor.a);

#ifdef GLINT
    // Applies color mask to glint texture instead and blends with original color
    vec4 layer1 = texture2D(TEXTURE_1, fract(layer1UV)).rgbr * glintColor;
    vec4 layer2 = texture2D(TEXTURE_1, fract(layer2UV)).rgbr * glintColor;
    vec4 glint = (layer1 + layer2) * tileLightColor;

    color = glintBlend(color, glint);
#endif

    // WARNING do not refactor this
#ifdef UI_ENTITY
    color.a *= HUD_OPACITY;
#endif

#ifdef USE_ALPHA
    color.a *= HIDE_COLOR.a;
#endif

#ifdef USE_BRIGHT
    color.rgb *= HIDE_COLOR.a;
#endif

    gl_FragColor = color;
  }
