(()=>{
const raw=[
{id:'conta-cdk',name:'CONTA COM CDK MUITO OP',category:'Blox Fruits',price:4.50,imageName:'CONTA COM CDK MUITO OP',stock:0,available:false}
];
const refs=window.RZK_REFERENCE.products;
window.RZK_PRODUCTS=raw.map(p=>({...p,...refs[p.imageName],name:p.name,category:p.category}));
window.RZK_CATEGORIES=[
{key:'Blox Fruits',title:'🍈 Blox Fruits',label:'Blox Fruits',emoji:'🍈',sourcePath:'/category/blox-fruits',image:'assets/categories/blox-fruits.png'}
];
window.RZK_HOME_SECTIONS=[
{category:'Blox Fruits',title:'🍈 Blox Fruits'}
];
})();
