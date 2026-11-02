(() => {
  let e = document.createElement("script");
  ((e.innerHTML =
    '(()=>{function e(t,o,p){for(let n in t)t.hasOwnProperty(n)&&(n===o?t[n]=p:"object"==typeof t[n]&&e(t[n],o,p))}function t(t,o){let p=JSON.parse;JSON.parse=(...n)=>{let r=p.apply(this,n);return e(r,t,o),r};let n=Response.prototype.json;Response.prototype.json=new Proxy(n,{apply(...p){let r=Reflect.apply(n,p[1],p[2]);return new Promise(((p,n)=>{r.then((n=>{e(n,t,o),p(n)})).catch((e=>n(e)))}))}})}t("playerAds",[]),t("adPlacements",[]),t("adSlots",[])})();'),
    (document.head || document.documentElement).prepend(e),
    setTimeout(() => {
      e.remove();
    }, 100));
})();
