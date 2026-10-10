
let PRODUCTS = [];
const REVIEW_POOL = [
 {n:"Camila R.",s:5,t:"Superó mis expectativas, se nota la calidad desde la primera vez que lo usé."},
 {n:"Andrea M.",s:4,t:"Me encantó el acabado, dura todo el día y no reseca."},
 {n:"Fernanda L.",s:5,t:"Ya es parte fija de mi rutina, el empaque también es precioso."},
 {n:"Valentina G.",s:3,t:"Bueno en general, aunque esperaba un poco más de pigmentación."},
 {n:"Renata P.",s:4,t:"Fácil de aplicar y se ve muy natural en piel."},
 {n:"Ximena T.",s:5,t:"Mi producto favorito de toda mi rutina de belleza, 100% recomendado."}
];
function stars(v){const f=Math.round(v);return "★".repeat(f)+"☆".repeat(5-f);}
function reviewsFor(id){const a=REVIEW_POOL[id%6],b=REVIEW_POOL[(id+2)%6],c=REVIEW_POOL[(id+4)%6];return [a,b,c];}
let cart = [];
let currentBrand="Todos", currentSearch="";
function filterBrand(b,el){currentBrand=b;[...document.querySelectorAll('.brandbar button')].forEach(x=>x.classList.remove('active'));el.classList.add('active');render();}
document.getElementById('searchInput').addEventListener('input',e=>{currentSearch=e.target.value.toLowerCase();render();});
function render(){
  const grid=document.getElementById('grid');
  const list=PRODUCTS.filter(p=>(currentBrand==="Todos"||p.brand===currentBrand)&&(p.name.toLowerCase().includes(currentSearch)||p.brand.toLowerCase().includes(currentSearch)));
  grid.innerHTML = list.map(p=>{
    const revs=reviewsFor(p.id);
    return `<div class="card">
      <div class="imgph"><img class="product-image" src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Imagen no disponible'}))"></div>
      <div class="card-body">
        <span class="brand">${p.brand.toUpperCase()}</span>
        <h3>${p.name}</h3>
        <p class="desc">${p.desc}</p>
        <div class="stars">${stars(p.rating)} <small>${p.rating.toFixed(1)} / 5</small></div>
        <div class="price">$${p.price.toFixed(2)} MXN</div>
        <button class="addbtn" onclick="addToCart(${p.id})">Agregar al carrito</button>
        <button class="revtoggle" onclick="this.nextElementSibling.classList.toggle('open')">Ver 3 reseñas</button>
        <div class="reviews">
          ${revs.map(r=>`<div class="rev"><b>${r.n}</b> <span class="stars">${stars(r.s)}</span><div>${r.t}</div></div>`).join('')}
        </div>
      </div>
    </div>`;
  }).join('') || '<p style="color:#888">No se encontraron productos.</p>';
}
async function loadProducts(){
  const grid=document.getElementById('grid');
  try {
    const response=await fetch('/api/products');
    if(!response.ok) throw new Error('No se pudo cargar el catálogo');
    PRODUCTS=await response.json();
    const brands=['Todos',...new Set(PRODUCTS.map(p=>p.brand))];
    document.getElementById('brandBar').innerHTML=brands.map((b,i)=>`<button class="${i===0?'active':''}" data-brand="${b}" onclick="filterBrand('${b}',this)">${b}</button>`).join('');
    render();
  } catch {
    grid.innerHTML='<p style="color:#888">No se pudo conectar con el servidor. Inicia Node.js o Docker y recarga.</p>';
  }
}
loadProducts();
function addToCart(id){
  const p=PRODUCTS.find(x=>x.id===id);
  const line=cart.find(c=>c.id===id);
  if(line) line.qty++; else cart.push({...p,qty:1});
  updateCart();
  toggleCart(true);
}
function removeFromCart(id){cart=cart.filter(c=>c.id!==id);updateCart();}
function updateCart(){
  document.getElementById('cartCount').textContent = cart.reduce((s,c)=>s+c.qty,0);
  document.getElementById('cartItems').innerHTML = cart.length ? cart.map(c=>`
    <div class="cart-line"><div>${c.name}<br><small>x${c.qty} · $${(c.price*c.qty).toFixed(2)}</small></div><button class="rm" onclick="removeFromCart(${c.id})">Quitar</button></div>
  `).join('') : '<p style="color:#999;font-size:13px">Tu carrito está vacío.</p>';
  const total=cart.reduce((s,c)=>s+c.price*c.qty,0);
  document.getElementById('cartTotal').textContent = `$${total.toFixed(2)} MXN`;
}
function toggleCart(open){
  document.getElementById('drawer').classList.toggle('open',open);
  document.getElementById('overlay').classList.toggle('show',open);
}
function openCheckout(){
  if(!cart.length) return;
  toggleCart(false);
  const total=cart.reduce((s,c)=>s+c.price*c.qty,0);
  document.getElementById('checkoutBody').innerHTML = `
    <h2>Finalizar compra</h2>
    <p style="font-size:13px;color:#666">Total a pagar: <b>$${total.toFixed(2)} MXN</b></p>
    <div class="field"><label>Nombre completo</label><input id="ckName" placeholder="Mainnie Pérez"></div>
    <div class="field"><label>Dirección de envío</label><input id="ckAddr" placeholder="Calle, número, ciudad"></div>
    <div class="secnote">Este checkout es solo una demostración. No ingreses datos reales de tarjeta; no se procesa ningún pago real.</div>
    <button class="paybtn" onclick="pay()">Confirmar pedido de prueba</button>
    <button class="cancelbtn" type="button" onclick="closeCheckout()">Cancelar</button>
  `;
  document.getElementById('checkoutOverlay').classList.add('show');
}
async function pay(){
  const name=document.getElementById('ckName').value.trim();
  const address=document.getElementById('ckAddr').value.trim();
  if(!name||!address){alert('Por favor ingresa tu nombre y dirección.');return;}
  let response, result;
  try {
    response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,address,items:cart.map(item=>({id:item.id,quantity:item.qty}))})});
    result=await response.json();
  } catch { alert('No se pudo conectar con el servidor.');return; }
  if(!response.ok){alert(result.error||'No se pudo registrar el pedido.');return;}
  document.getElementById('checkoutBody').innerHTML = `
    <div class="success">
      <div class="check">✅</div>
      <h2 style="text-align:center">¡Pedido registrado!</h2>
      <p style="font-size:13.5px;color:#666">Pedido de demostración <b>${result.id}</b>. Total calculado por el servidor: <b>$${result.total.toFixed(2)} MXN</b>. No se realizó ningún cobro.</p>
      <button class="paybtn" onclick="finishOrder()">Volver a la tienda</button>
    </div>`;
}
function finishOrder(){cart=[];updateCart();closeCheckout();}
function closeCheckout(){document.getElementById('checkoutOverlay').classList.remove('show');}
document.getElementById('checkoutOverlay').addEventListener('click',event=>{if(event.target.id==='checkoutOverlay')closeCheckout();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCheckout();});
updateCart();

