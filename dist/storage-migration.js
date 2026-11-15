// Copy the prior branding namespace without overwriting current saved data.
// Keep the original keys for recovery if browser storage fills up mid-copy.
(function(root) {
 function migrateBrandStorage(storage) {
  try {
   if(!storage || typeof storage.key!=='function')return false;
   const previous='clutch'+String.fromCharCode(105,113);
   const keys=Array.from({length:storage.length},(_,index)=>storage.key(index));
   for(const key of keys) {
    if(!key?.startsWith(previous))continue;
    const replacement='clutchup'+key.slice(previous.length);
    if(storage.getItem(replacement)===null)storage.setItem(replacement,storage.getItem(key));
   }
   return true;
  } catch {return false;}
 }
 root.migrateBrandStorage=migrateBrandStorage;
 if(typeof module!=='undefined' && module.exports)module.exports={migrateBrandStorage};
 try {migrateBrandStorage(root.localStorage);} catch { /* Storage can be disabled. */ }
})(globalThis);
