(()=>{
  const text=(v)=>String(v??'');
  window.RZK_CATALOG_READY=fetch('/api/catalog',{credentials:'same-origin',headers:{accept:'application/json'}})
    .then(async r=>{if(!r.ok)throw new Error('Não foi possível carregar o catálogo.');return r.json()})
    .then(data=>{
      const known={
        'Blox Fruits':{emoji:'🍈',image:'/assets/categories/blox-fruits.png'},
        'Jogos':{emoji:'🎮',image:'/assets/categories/jogos.png'},
        'Discord':{emoji:'◉',image:'/assets/categories/discord.png'},
        'Streamings':{emoji:'▶',image:'/assets/categories/streamings.png'},
      };
      window.RZK_PRODUCTS=Array.isArray(data.products)?data.products:[];
      window.RZK_CATEGORIES=(Array.isArray(data.categories)?data.categories:[]).map(name=>({key:name,label:name,title:`${known[name]?.emoji||'✦'} ${text(name)}`,emoji:known[name]?.emoji||'✦',image:known[name]?.image||window.RZK_PRODUCTS.find(p=>p.category===name)?.image||'/assets/rynex/banner-ofertas.webp'}));
      window.RZK_HOME_SECTIONS=window.RZK_CATEGORIES.map(c=>({category:c.key,title:c.title}));
      return {products:window.RZK_PRODUCTS,categories:window.RZK_CATEGORIES};
    })
    .catch(error=>{window.RZK_PRODUCTS=[];window.RZK_CATEGORIES=[];window.RZK_HOME_SECTIONS=[];window.RZK_CATALOG_ERROR=error;return {products:[],categories:[],error};});
})();
