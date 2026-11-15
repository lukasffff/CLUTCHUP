const root = new URL('../dist/tactical-match/vendor/',import.meta.url);
export async function resolve(specifier,context,next) {
  if (specifier === 'three' || specifier.startsWith('three/addons/')) {
    const relative = specifier === 'three' ? 'three.module.min.js' : specifier.slice(6);
    return { url: new URL(relative,root).href, shortCircuit:true };
  }
  return next(specifier,context);
}
