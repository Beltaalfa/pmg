/**
 * Executado cedo (beforeInteractive) para apanhar 404 em <script src="/_next/static/...">
 * antes da hidratação — o componente React chega tarde demais para estes erros.
 * Exportado como string para uso em <Script strategy="beforeInteractive">.
 */
export const CHUNK_LOAD_RECOVERY_INLINE = `(function(){
var FLAG="pmg_chunk_reload_done";
function tryReload(){try{if(sessionStorage.getItem(FLAG))return;sessionStorage.setItem(FLAG,"1");location.reload()}catch(e){}}
function isChunkMsg(s){return/chunk load failed|loading chunk|chunkloaderror|failed to fetch dynamically imported module/i.test(String(s||""))}
window.addEventListener("error",function(e){
var t=e.target;
if(t&&t.tagName==="SCRIPT"&&t.src&&t.src.indexOf("/_next/static/")!==-1){tryReload();return}
var msg=(e&&e.message)||"";
if(e&&e.error&&e.error.message)msg+=" "+e.error.message;
if((e&&e.filename)||"")msg+=" "+e.filename;
if(isChunkMsg(msg))tryReload()
},true);
window.addEventListener("unhandledrejection",function(e){
var r=e.reason;
var msg=typeof r==="string"?r:(r&&r.message)?r.message:String(r||"");
if(isChunkMsg(msg))tryReload()
})})();`;
