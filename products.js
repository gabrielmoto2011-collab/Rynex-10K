(()=>{
const raw=[
{id:'ia',name:'Inteligência Artificial',category:'Destaques',price:13.99,imageName:'Inteligência Artificial',stock:5},
{id:'xbox',name:'Xbox Gamepass 1m',category:'Destaques',price:2.49,imageName:'Xbox Gamepass 1m'},
{id:'netflix',name:'Netflix 4k Mensal',category:'Destaques',price:6.89,imageName:'Netflix 4k Mensal'},
{id:'spotify',name:'Spotify Premium',category:'Destaques',price:3.99,imageName:'Spotify Premium'},
{id:'steam-jogos',name:'Steam Jogos',category:'Jogos',price:3.99,imageName:'Steam Jogos'},
{id:'steam-keys',name:'Steam Keys',category:'Jogos',price:.99,imageName:'Steam Keys'},
{id:'minecraft',name:'Minecraft Java & Bedrock FA',category:'Jogos',price:.69,imageName:'Minecraft Java & Bedrock FA'},
{id:'discord-boost',name:'Discord Impulsos',category:'Discord',price:11.99,imageName:'Discord Impulsos'},
{id:'discord-nitro',name:'Discord Nitros',category:'Discord',price:4.99,imageName:'Discord Nitros'},
{id:'discord-accounts',name:'Contas Discord',category:'Discord',price:.75,imageName:'Contas Discord'},
{id:'discord-nitro-accounts',name:'Contas com Nitros',category:'Discord',price:3.89,imageName:'Contas com Nitros'},
{id:'discord-members',name:'Membros Premium - 5k (AUTH NOVA)',category:'Discord',price:11.99,imageName:'Membros Premium - 5k (AUTH NOVA)'},
{id:'paramount',name:'Paramount+ Plus',category:'Assinaturas',price:2.99,imageName:'Paramount+ Plus'},
{id:'combo',name:'(MAIS VENDIDOS) - Combo assinaturas',category:'Assinaturas',price:6.78,imageName:'(MAIS VENDIDOS) - Combo assinaturas'},
{id:'premiere',name:'Premiere+',category:'Assinaturas',price:5.49,imageName:'Premiere+'},
{id:'hbo',name:'Hbo Max Premium',category:'Assinaturas',price:1.89,imageName:'Hbo Max Premium'},
{id:'disney',name:'Disney Plus',category:'Assinaturas',price:3.89,imageName:'Disney Plus'},
{id:'crunchyroll',name:'Crunchyroll Premium',category:'Assinaturas',price:.89,imageName:'Crunchyroll Premium'},
{id:'canva',name:'Canva Pro Mensal - Convite Família',category:'Assinaturas',price:2.99,oldPrice:5.30,discount:'-44%',imageName:'Canva Pro Mensal - Convite Família',stock:15,automatic:true},
{id:'prime',name:'Prime Vídeo',category:'Assinaturas',price:3.99,imageName:'Prime Vídeo'},
{id:'youtube',name:'Youtube Premium',category:'Assinaturas',price:4.59,imageName:'Youtube Premium'},
{id:'globoplay',name:'Gl0bo Play Premium',category:'Assinaturas',price:1.00,imageName:'Gl0bo Play Premium'},
{id:'create-store',name:'CRIE SUA LOJA (FORNECEDORES + ADS + DESIGNS)',category:'Diversos',price:109.99,oldPrice:350,discount:'-69%',imageName:'CRIE SUA LOJA (FORNECEDORES + ADS + DESIGNS)',stock:2,automatic:true},
{id:'luck',name:'TESTE SUA SORTE HJJ!!!!',category:'Diversos',price:1.47,imageName:'TESTE SUA SORTE HJJ!!!!'},
{id:'methods',name:'Métodos 1 Real',category:'Diversos',price:.99,imageName:'Métodos 1 Real'},
{id:'keywords',name:'Palavras Chaves + 500 Questões + Redação Nota 1000',category:'Diversos',price:1.99,oldPrice:27.90,discount:'-93%',imageName:'Palavras Chaves + 500 Questões + Redação Nota 1000',stock:20,automatic:true},
{id:'optimize',name:'Otimizaçao PC e Celular',category:'Diversos',price:3.99,imageName:'Otimizaçao PC e Celular'}
];
const refs=window.RZK_REFERENCE.products;
window.RZK_PRODUCTS=raw.map(p=>({...p,...refs[p.imageName],name:p.name,category:p.category}));
window.RZK_CATEGORIES=[
{key:'Destaques',title:'🚀 Destaques',label:'Destaques',emoji:'🚀',sourcePath:'/category/17498184186957014240966308445576',image:'assets/categories/category-01.png'},
{key:'Jogos',title:'🏆 Jogos Populares',label:'Jogos Exclusivos',emoji:'🏆',sourcePath:'/category/jogos',image:'assets/categories/category-02.png'},
{key:'Discord',title:'🚀 Produtos do Discord',label:'Discord',emoji:'🚀',sourcePath:'/category/discord',image:'assets/categories/category-03.png'},
{key:'Assinaturas',title:'🛒 Assinaturas Exclusivas',label:'Streamings',emoji:'🛒',sourcePath:'/category/streamings',image:'assets/categories/category-04.png'},
{key:'Diversos',title:'📦 Produtos Diversos',label:'Outros',emoji:'📦',sourcePath:'/category/1771448468275983674435601',image:'assets/categories/category-05.png'}
];
window.RZK_HOME_SECTIONS=[
{category:'Destaques',title:'🚀 Destaques'},
{category:'Jogos',title:'🏆 Jogos Populares'},
{category:'Discord',title:'🚀 Produtos do Discord'},
{category:'Assinaturas',title:'🛒 Assinaturas Exclusivas'},
{category:'Diversos',title:'📦 Produtos Diversos'}
];
})();
