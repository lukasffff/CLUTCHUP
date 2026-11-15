export const GRAPHICS_PRESETS = Object.freeze({
 low: {pixelCap:1,scale:.75,antialias:false,post:false,ssao:false,shadow:1024,environment:512},
 medium: {pixelCap:1.25,scale:1,antialias:true,post:true,ssao:false,shadow:2048,environment:1024},
 high: {pixelCap:2,scale:1,antialias:true,post:true,ssao:true,shadow:3072,environment:2048}
});
export function graphicsQuality(value, fallback='high') {
 return Object.hasOwn(GRAPHICS_PRESETS,value) ? value : fallback;
}
export function graphicsRatio(quality, deviceRatio=1) {
 const preset=GRAPHICS_PRESETS[graphicsQuality(quality)];
 return Math.min(Math.max(1,Number(deviceRatio)||1),preset.pixelCap)*preset.scale;
}
