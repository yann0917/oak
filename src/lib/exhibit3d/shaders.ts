// 展厅 3D 渲染核 · 着色器
//
// 「动森化」的关键决定（来自对 whistlevale 的实测对比）：
//  1. **不用程序化噪声**。per-cell 哈希在平涂画风下会被放大成怪异色斑
//     （实测：whistlevale 展厅地板平涂后出现粉红斑块）。花纹一律交给几何块面的明度差。
//  2. **明暗分带**而不是连续衰减。用一个 smoothstep 把关照切成两段，
//     这是「平涂」而不是「照片感」的来源。
//  3. **暗部偏蓝且不能太暗**。半球环境光贡献大头，投影像「有颜色的阴影」而不是黑块。
//     世界最亮处略过曝、最暗处仍保留 ~55% 明度 = 高调。
//  4. 玻璃做成**不透明反射面**（天空色 + 菲涅尔 + 高光），省掉一整条透明渲染通路。

export const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aMat;
layout(location=4) in vec2 aUV;

uniform mat4 uModel, uVP, uLightVP;
uniform float uTime;

out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;
out float vMat;
out vec2 vUV;
out vec4 vShadow;

void main(){
  vec4 p = uModel * vec4(aPosition, 1.0);
  // 植物轻微呼吸：幅度很小，只是让画面「活着」，不是动画
  if (abs(aMat - 3.0) < 0.5) {
    p.x += sin(uTime * 1.15 + p.x * 0.9 + p.z * 0.6) * 0.022;
    p.z += sin(uTime * 0.87 + p.z * 0.8) * 0.016;
  }
  vPos = p.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vMat = aMat;
  vUV = aUV;
  vShadow = uLightVP * p;
  gl_Position = uVP * p;
}`;

export const FRAG = `#version 300 es
precision highp float;

in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
in float vMat;
in vec2 vUV;
in vec4 vShadow;

uniform sampler2D uShadow;
uniform sampler2D uAtlas;
uniform vec3 uEye;
uniform vec3 uSun;
uniform float uTime;

out vec4 frag;

// 3x3 PCF，边界压得很软——模型尺度下硬阴影会显得脏
float shadowAt(vec3 n){
  vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = max(0.0009, 0.0032 * (1.0 - dot(n, normalize(uSun))));
  float s = 0.0;
  vec2 texel = 1.0 / vec2(textureSize(uShadow, 0));
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
      s += w * (p.z - bias < texture(uShadow, p.xy + vec2(float(x), float(y)) * texel * 1.6).r ? 1.0 : 0.0);
    }
  }
  return s / 16.0;
}

void main(){
  float m = floor(vMat + 0.5);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uEye - vPos);
  vec3 L = normalize(uSun);

  vec3 base = vColor;

  // ---- 材质分支（只有必要的几种，且都不含噪声） ----
  float rough = 0.85;
  float metal = 0.0;
  float em = 0.0;
  float rim = 0.0;

  if (m == 1.0) { rough = 0.28; metal = 0.75; }               // 金属
  else if (m == 2.0) {                                        // 玻璃：天空反射，不透明
    float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 sky = mix(vec3(0.60, 0.79, 0.96), vec3(0.36, 0.62, 0.90), max(n.y, 0.0));
    vec3 refl = sky * (0.62 + f * 0.55);
    refl += vec3(1.0, 0.98, 0.9) * pow(max(dot(n, normalize(L + v)), 0.0), 90.0) * 0.45;
    frag = vec4(refl, 1.0);
    return;
  }
  else if (m == 3.0) { rough = 0.92; rim = 0.22; }            // 植物
  else if (m == 4.0) { rough = 0.95; }                        // 地面
  else if (m == 5.0) { em = 1.35; rough = 0.5; }              // 自发光
  else if (m == 6.0) { rough = 0.35; rim = 0.12; }            // 亮面塑料
  else if (m == 7.0) { base = texture(uAtlas, vUV).rgb; rough = 0.62; } // 名牌贴图

  // 提饱和：动森是高饱和，不是去饱和。上限压到 0.94，
  // 下面乘光照系数时构造上就不会过曝（朝上的平面最容易吃满光）。
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  base = clamp(mix(vec3(lum), base, 1.22), 0.0, 0.94);

  // ---- 关照：环绕漫反射 + 两段分带 ----
  //
  // 关键决定：**在两段颜色之间插值，而不是把环境光与方向光相加**。
  // 相加的话朝上的平面（草地、地面）必然超过 1.0 被冲成白色——
  // 实测过：整块草坪变成白板，只剩树还是绿的。
  // 插值则构造上封顶，且暗部明度可以独立指定（高调的底线）。
  float ndl = dot(n, L) * 0.5 + 0.5;
  ndl *= ndl;                                  // 亮面收拢，暗面铺开
  float band = smoothstep(0.42, 0.58, ndl);    // ← 平涂的来源

  vec3 shadeTint = vec3(0.66, 0.74, 0.94);     // 暗部：偏蓝，但仍然亮
  vec3 litTint = vec3(1.02, 0.99, 0.92);       // 亮部：偏暖
  vec3 lightMul = mix(shadeTint, litTint, band * shadowAt(n));

  // 半球只做轻微的上下区分，不再叠加亮度
  lightMul *= mix(0.97, 1.05, n.y * 0.5 + 0.5);

  vec3 lit = base * lightMul;

  // 高光只给金属/亮面塑料，且收得很窄
  if (metal > 0.0 || rough < 0.5) {
    vec3 h = normalize(L + v);
    float spec = pow(max(dot(n, h), 0.0), mix(12.0, 120.0, 1.0 - rough));
    lit += vec3(1.0, 0.97, 0.90) * spec * mix(0.05, 0.45, metal) * shadowAt(n);
  }

  // 植物边缘透光：让树冠不是死球
  if (rim > 0.0) lit += base * vec3(1.0, 0.98, 0.90) * pow(1.0 - max(dot(n, v), 0.0), 2.2) * rim;

  // 自发光：灯与暖窗（允许略微过曝，这是「亮着」的信号）
  lit += pow(base, vec3(1.4)) * em;

  frag = vec4(clamp(lit, 0.0, 1.0), 1.0);
}`;

/** 只写深度的阴影 pass */
export const SHADOW_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
uniform mat4 uModel, uLightVP;
void main(){ gl_Position = uLightVP * uModel * vec4(aPosition, 1.0); }`;

export const SHADOW_FRAG = `#version 300 es
precision highp float;
void main(){}`;
