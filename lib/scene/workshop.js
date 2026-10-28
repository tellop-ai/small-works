import * as THREE from './vendor/three.module.js';

const ACTIVITIES = new Set(['idle', 'saw', 'plane', 'hammer', 'sand', 'carve', 'heat', 'tongs']);
const RECIPES = new Set(['wooden-spoon', 'stool', 'birdhouse', 'wall-shelf', 'keepsake-box', 'toy-boat', 'dining-chair', 'writing-desk', 'cabinet', 'hinge-set', 'tool-head', 'lantern', 'iron-stand', 'reinforced-chest', 'garden-bench', 'standing-lamp']);
const MIXED_RECIPES = new Set(['reinforced-chest', 'garden-bench', 'standing-lamp']);
const recipe = id => id === 'neighborhood-greenhouse' || RECIPES.has(id) ? id : 'stool';
const PATTERNS = new Set(['plain', 'carved-ripples', 'carved-leaves']);
const FINISHES = new Set(['natural', 'warm-honey', 'dusk-blue']);
const pattern = id => PATTERNS.has(id) ? id : 'plain';
const finish = id => FINISHES.has(id) ? id : 'natural';
const fraction = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const MOTIONS = new Set(['full', 'reduced', 'still']);
const activity = value => value === 'forge' ? 'hammer' : ACTIVITIES.has(value) ? value : 'idle';
const stages = value => value && typeof value === 'object' ? Object.fromEntries(['wood', 'metal', 'assemble', 'd1', 'd2', 'panel-a', 'panel-b', 'frame'].filter(id => Object.hasOwn(value, id)).map(id => [id, fraction(value[id])])) : null;
function normalize(options = {}) {
  // Staff records describe presence; only allocated activities describe work.
  // Keep role identity independent of lane ordering, and animate at most three allocated workers.
  const mainActivity=['heat','tongs'].includes(activity(options.activity))?'idle':activity(options.activity);
  let remaining = (options.yard ? 3 : 2) - (mainActivity === 'idle' ? 0 : 1);
  const seen = new Set();
  const crew = Array.isArray(options.crew) ? options.crew.filter(member => {
    if (!member || !['apprentice', 'blacksmith', 'carver', 'finisher'].includes(member.staffId) || seen.has(member.staffId)) return false;
    seen.add(member.staffId); return true;
  }).slice(0, 4).map(member => {
    let clip = activity(member.activity);
    if (member.staffId === 'apprentice' && ['heat', 'tongs'].includes(clip)) clip = 'idle';
    if (member.staffId === 'blacksmith' && !['idle', 'hammer', 'heat', 'tongs', 'sand'].includes(clip)) clip = 'idle';
    if (member.staffId === 'carver' && ['heat', 'tongs'].includes(clip)) clip = 'idle';
    if (member.staffId === 'finisher' && !['idle', 'sand'].includes(clip)) clip = 'idle';
    if (['carver', 'finisher'].includes(member.staffId) && !options.yard) clip = 'idle';
    if (member.status !== 'active' || (member.staffId === 'blacksmith' && !options.forge)) clip = 'idle';
    if (clip !== 'idle') { if (remaining) remaining--; else clip = 'idle'; }
    return { staffId: member.staffId, status: member.status, activity: clip, progress: fraction(member.progress), recipeId: member.recipeId === null || (member.staffId==='blacksmith'&&!RECIPES.has(member.recipeId)&&member.recipeId!=='neighborhood-greenhouse') || (!member.recipeId && ['carver','finisher'].includes(member.staffId)) ? null : recipe(member.recipeId), stageId: member.stageId, stageProgress: stages(member.stageProgress), patternId: pattern(member.patternId), finishStyleId: finish(member.finishStyleId) };
  }) : [];
  return {
    activity: mainActivity,
    progress: fraction(options.progress),
    // Explicit null clears Nora's worktop; omitted legacy props retain the stool.
    recipeId: options.recipeId === null ? null : recipe(options.recipeId),
    joinery: Boolean(options.joinery),
    forge: Boolean(options.forge),
    yard: Boolean(options.yard),
    greenhouse: options.greenhouse && ['making', 'ready', 'delivered'].includes(options.greenhouse.status) ? { status: options.greenhouse.status, stageProgress: stages(options.greenhouse.stageProgress) || {} } : null,
    patternId: pattern(options.patternId),
    finishStyleId: finish(options.finishStyleId),
    mainStageId: options.mainStageId,
    stageProgress: stages(options.stageProgress),
    crew,
    motion: MOTIONS.has(options.motion) ? options.motion : 'full',
    expanded: Boolean(options.expanded),
  };
}

/**
 * The approved Nora workshop, rendered entirely from bundled procedural assets.
 * Presentation only: animation time never adds focus time or changes app records.
 * Call update with current props, and dispose when the canvas leaves the page.
 */
export function initializeWorkshopScene({ canvas, container, onUnavailable, ...options }) {
  let settings=normalize(options),disposed=false,failed=false,raf=0,timer=0,last=performance.now(),elapsedScene=0,drawProgress=settings.progress;
  let clipClock=0,activeClip='',walking=false,closeView=!settings.expanded;
  const design={motion:settings.motion!=='still'};
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-7,7,6,-6,.1,80);
const hemi=new THREE.HemisphereLight(0xfff7db,0x708b74,2.5);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffe9bd,4.2);sun.position.set(-3,9,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:30});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun);scene.add(new THREE.AmbientLight(0xffffff,.35));
const materials={},geometries={};
function mat(color,rough=.78){const k=color+'-'+rough;return materials[k]||(materials[k]=new THREE.MeshStandardMaterial({color,roughness:rough,metalness:rough<.4?.2:0}));}
const palette={wood:'#b9814c',edge:'#8b5e38',light:'#ddb17a',pale:'#efd1a0',floor:['#c49462','#cd9c6a','#ba8a5a','#d1a572'],green:'#71866a',deep:'#465f4a',wall:'#e6dfc8',metal:'#53645c',cream:'#faf1da',terra:'#bc7353',skin:'#dba77a',shirt:'#dbad53',pants:'#526859',hair:'#49372e'};
function rounded(w,h,d,r=.035){const key=[w,h,d,r].join();if(geometries[key])return geometries[key];const sh=new THREE.Shape(),x=-w/2+r,y=-h/2+r;sh.moveTo(x,y);sh.lineTo(w/2-r,y);sh.lineTo(w/2-r,h/2-r);sh.lineTo(x,h/2-r);sh.closePath();const g=new THREE.ExtrudeGeometry(sh,{depth:Math.max(.005,d-2*r),bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r});g.translate(0,0,-d/2+r);return geometries[key]=g;}
function mesh(g,color,parent,x=0,y=0,z=0){const m=new THREE.Mesh(g,typeof color==='string'?mat(color):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,color,parent,x=0,y=0,z=0,r=.025){return mesh(rounded(w,h,d,Math.min(r,w/4,h/4,d/4)),color,parent,x,y,z);}
function cyl(rt,rb,h,color,parent,x=0,y=0,z=0,n=16){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),color,parent,x,y,z);}
function ball(r,color,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){const m=mesh(new THREE.SphereGeometry(r,12,8),color,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
function group(parent,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function beam(a,b,width,color,parent){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),m=cyl(width,width,va.distanceTo(vb),color,parent);m.position.copy(va).add(vb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return m;}
const room=group(scene);
box(8.6,.38,7.1,palette.deep,room,0,-.25,0,.13);box(8.5,.12,7.0,palette.edge,room,0,-.02,0,.045);
for(let z=0;z<20;z++){for(let x=0;x<3;x++){const m=box(2.76,.075,.335,palette.floor[(z+x*3)%4],room,(x-1)*2.79,.07,(z-9.5)*.345,.014);for(let k=0;k<2;k++)box(.32,.005,.006,'#a67c50',room,m.position.x+(k-.5)*1.13,.111,m.position.z+(k-.5)*.09,.001);}}
box(8.55,2.8,.16,palette.wall,room,0,1.51,-3.46,.04);box(.16,2.8,7.0,palette.wall,room,-4.25,1.51,0,.04);
box(8.65,.17,.24,palette.edge,room,0,2.95,-3.46,.035);box(.24,.17,7.1,palette.edge,room,-4.25,2.95,0,.035);
for(const x of [-4.18,0,4.15])box(.16,2.8,.2,palette.wood,room,x,1.51,-3.34,.02);
for(const z of [-3.35,0,3.35])box(.2,2.8,.16,palette.wood,room,-4.14,1.51,z,.02);
box(8.4,.2,.2,palette.wood,room,0,.26,-3.31,.015);box(.2,.2,6.8,palette.wood,room,-4.1,.26,0,.015);
// Deep window reveal, glazing, mullions, and a window-box garden.
box(2.02,1.6,.13,palette.edge,room,-2.02,1.94,-3.28,.035);box(1.84,1.43,.06,'#a9c9be',room,-2.02,1.94,-3.19,.02);
box(.09,1.48,.1,palette.cream,room,-2.02,1.94,-3.12,.015);box(1.87,.09,.1,palette.cream,room,-2.02,1.94,-3.12,.015);
box(2.18,.13,.39,palette.light,room,-2.02,1.15,-3.15,.025);
const sunbeam=mesh(new THREE.PlaneGeometry(1.75,3.1),new THREE.MeshBasicMaterial({color:'#fff0b1',transparent:true,opacity:.12,depthWrite:false}),room,-1.3,.118,-1.45);sunbeam.rotation.x=-Math.PI/2;sunbeam.rotation.z=.22;sunbeam.castShadow=false;
// Left storage cabinet and wall-mounted open shelves.
box(.94,1.05,2.85,palette.green,room,-3.62,.66,-.7,.055);box(1.1,.14,3.03,palette.light,room,-3.61,1.22,-.7,.035);
for(let i=0;i<3;i++){box(.035,.7,.78,palette.deep,room,-3.12,.63,-1.65+i*.95,.008);box(.07,.08,.2,palette.light,room,-3.07,.77,-1.65+i*.95,.012);}
for(const y of [1.92,2.52]){box(.54,.1,2.3,palette.light,room,-3.92,y,-.95,.02);for(let i=0;i<3;i++){cyl(.11,.13,.27,[palette.terra,palette.green,palette.cream][i],room,-3.86,y+.18,-1.7+i*.65);cyl(.12,.12,.05,palette.edge,room,-3.86,y+.34,-1.7+i*.65);}}
// Pegboard and real little hand tools.
box(2.65,1.18,.12,palette.wood,room,1.62,2.03,-3.28,.035);
for(let x=0;x<11;x++)for(let y=0;y<4;y++)ball(.014,palette.edge,room,.48+x*.225,1.62+y*.26,-3.205);
for(let i=0;i<5;i++){const t=group(room,.65+i*.46,2.08,-3.09);cyl(.035,.035,.45,palette.light,t,0,-.1,0,8);if(i%2===0)box(.28,.13,.12,palette.metal,t,0,.14,0,.02);else box(.13,.3,.05,palette.metal,t,0,.2,0,.015);}
box(2.67,.12,.43,palette.light,room,1.62,1.37,-3.14,.025);
// Timber rack, stacked logs, and a little offcut bin.
const rack=group(room,3.25,0,-2.45);
for(const x of [-.48,.48])box(.1,1.65,.1,palette.deep,rack,x,.95,0);
for(let level=0;level<3;level++){box(1.25,.08,.7,palette.deep,rack,0,.35+level*.53,.03);for(let i=0;i<4;i++)box(1.18,.09,.12,palette.floor[i],rack,0,.44+level*.53,i*.13-.2,.01);}
const bin=group(room,3.52,.12,.38);box(.64,.54,.68,palette.edge,bin,0,.27,0,.035);for(let i=0;i<5;i++){const b=box(.12,.9+(i%2)*.18,.09,palette.light,bin,(i%3-.9)*.17,.55,(i%2-.5)*.2);b.rotation.z=(i-2)*.06;}
// The workbench has a vise, drawers, lower shelf, and end-grain details.
const bench=group(room,0,0,-.02);
for(const x of [-1.43,1.43])for(const z of [-.54,.54])box(.18,1.24,.18,palette.edge,bench,x,.72,z,.025);
box(3.25,.21,1.58,palette.light,bench,0,1.42,0,.06);box(3.0,.13,1.33,palette.wood,bench,0,.4,0,.025);
for(let i=0;i<3;i++){box(.82,.27,.1,palette.wood,bench,(i-1)*.97,1.13,.64,.018);box(.2,.05,.09,palette.deep,bench,(i-1)*.97,1.13,.72,.008);}
box(.22,.38,.36,palette.metal,bench,-1.66,1.25,.35,.025);const vise=beam([-1.82,1.28,.35],[-1.95,1.28,.35],.035,palette.metal,bench);beam([-1.95,1.07,.35],[-1.95,1.5,.35],.027,palette.light,bench);
for(let i=0;i<4;i++)box(.45,.07,.5,palette.floor[i],bench,-.95+i*.53,.51,.1,.015);
const cuttingBoard=box(1.10,.085,.36,palette.pale,bench,-.65,1.57,-.40,.015);
for(let i=0;i<5;i++)box(.79-i*.055,.004,.004,palette.wood,bench,-.67+(i%2)*.04,1.614,-.52+i*.052,.001);
box(.07,.12,.33,palette.edge,bench,-1.23,1.565,-.40,.012);
// Small objects make the space feel like a working place.
const stoolSpare=group(room,-2.3,0,1.2);for(const x of [-.22,.22])for(const z of [-.22,.22])beam([x,.13,z],[x*.82,.73,z*.82],.055,palette.wood,stoolSpare);cyl(.38,.38,.13,palette.light,stoolSpare,0,.78,0);
const rug=box(1.45,.025,2.3,'#b77556',room,-2.48,.135,1.15,.04);for(let i=0;i<5;i++)box(1.38,.004,.075,'#e6c493',room,-2.48,.151,.32+i*.4,.001);
const kettle=cyl(.14,.17,.29,palette.deep,room,-3.5,1.46,-.8);ball(.14,palette.deep,room,-3.5,1.6,-.8,1,.35,1);beam([-3.4,1.51,-.8],[-3.19,1.65,-.8],.045,palette.deep,room);
const mug=cyl(.095,.085,.19,palette.cream,room,-3.42,1.4,-.32);
function plant(parent,x,y,z,scale=1){const p=group(parent,x,y,z);p.scale.setScalar(scale);cyl(.2,.15,.34,palette.terra,p,0,.17,0);cyl(.205,.205,.055,palette.light,p,0,.33,0);cyl(.17,.17,.016,'#6c513c',p,0,.35,0);const leaves=group(p,0,.36,0);for(let i=0;i<6;i++){const a=i*Math.PI/3;beam([0,0,0],[Math.sin(a)*.2,.32+(i%2)*.13,Math.cos(a)*.2],.014,palette.deep,leaves);const leaf=ball(.16,i%2?'#7e9b66':'#96ae72',leaves,Math.sin(a)*.23,.32+(i%2)*.13,Math.cos(a)*.23,.65,1.7,.5);leaf.rotation.z=Math.sin(a)*-.5;leaf.rotation.x=Math.cos(a)*.4;}return leaves;}
const plants=[plant(room,-3.58,1.3,-1.78,.8),plant(room,2.5,1.45,-3.05,.6),plant(room,-3.68,.13,2.6,1.5)];
const clockG=group(room,-4.02,2.2,1.2);clockG.rotation.y=Math.PI/2;const clockFace=cyl(.34,.34,.07,palette.cream,clockG);clockFace.rotation.x=Math.PI/2;const clockRim=new THREE.Mesh(new THREE.TorusGeometry(.34,.035,8,32),mat(palette.edge));clockG.add(clockRim);const hand1=box(.025,.21,.02,palette.deep,clockG,0,.08,.05,.004),hand2=box(.023,.15,.025,palette.deep,clockG,.06,0,.055,.004);hand2.rotation.z=-Math.PI/2;
function refinedCarpenter(parent, appearance = {}){
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const C={skin:'#edb38c',skinLight:'#f4c6a2',ear:'#d48f78',lip:'#aa5e59',hair:'#243350',hairLight:'#344967',shirt:'#d86960',shirtLight:'#e58677',shirtShadow:'#bd5954',apron:'#236575',apronEdge:'#38818b',pocket:'#4e8c8c',pants:'#283b59',pantsLight:'#405776',boot:'#79654d',sole:'#3b3b3a',brass:'#c7a253',ivory:'#fff8e9',...appearance};
const materials={};function mat(color,rough=.8){const k=color+rough;return materials[k]||(materials[k]=new THREE.MeshStandardMaterial({color,roughness:rough,metalness:rough<.4?.25:0}));}
function group(parent,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function mesh(geo,color,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,typeof color==='string'?mat(color):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const sphere=new THREE.SphereGeometry(1,40,32);
function oval(parent,x,y,z,rx,ry,rz,color){const m=mesh(sphere,color,parent,x,y,z);m.scale.set(rx,ry,rz);return m;}
function cylinder(parent,x,y,z,r1,r2,h,color){return mesh(new THREE.CylinderGeometry(r1,r2,h,32),color,parent,x,y,z);}
function cap(parent,x,y,z,r,length,color){return mesh(new THREE.CapsuleGeometry(r,Math.max(.001,length-2*r),8,16),color,parent,x,y,z);}
function line(parent,points,r,color){const curve=new THREE.CatmullRomCurve3(points.map(p=>Array.isArray(p)?V(...p):p));return mesh(new THREE.TubeGeometry(curve,Math.max(16,points.length*8),r,8,false),color,parent);}
function patch(parent,points,color,depth=.012){const center=points.reduce((v,p)=>v.add(V(...p)),V()).multiplyScalar(1/points.length),pos=[...center.toArray()],indices=[];for(const p of points)pos.push(...p);for(let i=0;i<points.length;i++)indices.push(0,i+1,(i+1)%points.length+1);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(indices);geo.computeVertexNormals();const material=mat(color).clone();material.side=THREE.DoubleSide;return mesh(geo,material,parent);}
function roundedBox(parent,w,h,d,r,color,x=0,y=0,z=0){const shape=new THREE.Shape();shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const geo=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.01,d-r),steps:1,bevelEnabled:true,bevelSegments:3,bevelThickness:r/2,bevelSize:r/2,curveSegments:8});geo.translate(0,0,-d/2);return mesh(geo,color,parent,x,y,z);}
function sampleRows(rows,y){let j=0;while(j<rows.length-2&&y>rows[j+1][0])j++;const t=clamp((y-rows[j][0])/(rows[j+1][0]-rows[j][0]),0,1);return rows[j].map((v,i)=>{if(i===0)return y;const a=rows[Math.max(0,j-1)][i],b=v,c=rows[j+1][i],d=rows[Math.min(rows.length-1,j+2)][i],value=.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);return i<4?Math.max(.003,value):value;});}
function loft(parent,rows,color,{radial=64,vertical=64,sculpt=null}={}){const pos=[],idx=[];for(let i=0;i<=vertical;i++){const y=lerp(rows[0][0],rows.at(-1)[0],i/vertical),r=sampleRows(rows,y);for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2,x=Math.sin(a)*r[1],z=Math.cos(a)*(Math.cos(a)>=0?r[2]:(r[3]??r[2]))+(r[4]??0),p=sculpt?sculpt(x,y,z,a):V(x,y,z);pos.push(p.x,p.y,p.z);}}for(let i=0;i<vertical;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;idx.push(a,a+1,b,a+1,b+1,b);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();return mesh(geo,color,parent);}
function ribbon(parent,points,width,color){const curve=new THREE.CatmullRomCurve3(points.map(p=>V(...p))),pos=[],idx=[];for(let i=0;i<=40;i++){const t=i/40,p=curve.getPoint(t),tangent=curve.getTangent(t),cross=V(1,0,0).addScaledVector(tangent,-tangent.x).normalize();for(const side of [-1,1])pos.push(...p.clone().addScaledVector(cross,side*width/2).toArray());if(i<40){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();const material=mat(color).clone();material.side=THREE.DoubleSide;return mesh(geo,material,parent);}
function tubeRig(parent,color,radius,{segments=36,sides=20}={}){const geo=new THREE.BufferGeometry(),positions=new Float32Array((segments+1)*(sides+1)*3),indices=[];geo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,a+1,b,b,a+1,b+1);}geo.setIndex(indices);const m=mesh(geo,color,parent);m.frustumCulled=false;m.userData={radius,segments,sides};return m;}
function bendTube(tube,points,endT=1){const curve=new THREE.CatmullRomCurve3(points),{radius,segments,sides}=tube.userData,p=tube.geometry.attributes.position;for(let i=0;i<=segments;i++){const u=i/segments,t=u*endT,center=curve.getPoint(t),tangent=curve.getTangent(t),a=V(0,0,1);if(Math.abs(tangent.z)>.92)a.set(1,0,0);a.cross(tangent).normalize();const b=V().crossVectors(tangent,a).normalize(),r=radius(u);for(let j=0;j<=sides;j++){const angle=j/sides*Math.PI*2,k=i*(sides+1)+j;p.setXYZ(k,center.x+(a.x*Math.cos(angle)+b.x*Math.sin(angle))*r[0],center.y+(a.y*Math.cos(angle)+b.y*Math.sin(angle))*r[0],center.z+(a.z*Math.cos(angle)+b.z*Math.sin(angle))*(r[1]??r[0]));}}p.needsUpdate=true;tube.geometry.computeVertexNormals();}
const rig=group(parent),spine=group(rig,0,2.65,0),body=group(spine,0,-2.65,0);
// One shirt mesh: the sleeve roots share the torso's armhole vertices.
function createShirt(parent,rows){
  const radial=64,vertical=64,sleeveRows=28,positions=[],indices=[],sleeves=[],bottom=39,top=60;
  const point=(i,j)=>{const y=lerp(rows[0][0],rows.at(-1)[0],i/vertical),r=sampleRows(rows,y),a=j/radial*Math.PI*2,fold=.008*Math.sin(y*19+a*7)*Math.sin(a)**2;return V(Math.sin(a)*r[1]+fold,y,Math.cos(a)*r[2]+fold);};
  const at=(i,j)=>i*(radial+1)+j;
  for(let i=0;i<=vertical;i++)for(let j=0;j<=radial;j++)positions.push(...point(i,j).toArray());
  for(let i=0;i<vertical;i++)for(let j=0;j<radial;j++){
    if(i>=bottom&&i<top&&((j>=8&&j<24)||(j>=40&&j<56)))continue;
    const a=at(i,j),b=at(i+1,j);indices.push(a,a+1,b,a+1,b+1,b);
  }
  for(const side of [1,-1]){
    const lo=side===1?8:40,hi=lo+16,coords=[];
    for(let j=lo;j<=hi;j++)coords.push([bottom,j]);
    for(let i=bottom+1;i<=top;i++)coords.push([i,hi]);
    for(let j=hi-1;j>=lo;j--)coords.push([top,j]);
    for(let i=top-1;i>bottom;i--)coords.push([i,lo]);
    const centerY=(point(bottom,lo).y+point(top,lo).y)/2,halfHeight=(point(top,lo).y-point(bottom,lo).y)/2;
    const boundary=coords.map(([i,j])=>{
      const p=point(i,j),tangent=V();
      if(i===bottom)tangent.add(p.clone().sub(point(i-1,j)).normalize());
      if(i===top)tangent.add(p.clone().sub(point(i+1,j)).normalize());
      if(j===lo)tangent.add(p.clone().sub(point(i,j-1)).normalize());
      if(j===hi)tangent.add(p.clone().sub(point(i,j+1)).normalize());
      const angle=Math.atan2(p.z/.25,(p.y-centerY)/halfHeight);
      return{index:at(i,j),p,control:p.clone().addScaledVector(tangent.normalize(),.16),cos:Math.cos(angle),sin:Math.sin(angle)};
    });
    const count=boundary.length,start=positions.length/3;
    for(let row=1;row<=sleeveRows;row++)for(const b of boundary)positions.push(...b.p.toArray());
    for(let row=0;row<sleeveRows;row++)for(let j=0;j<count;j++){
      const next=(j+1)%count,a=row===0?boundary[j].index:start+(row-1)*count+j,an=row===0?boundary[next].index:start+(row-1)*count+next,b=start+row*count+j,bn=start+row*count+next;
      indices.push(a,an,b,an,bn,b);
    }
    sleeves.push({side,boundary,start,count,rows:sleeveRows});
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
  const shirt=mesh(geometry,C.shirt,parent);shirt.frustumCulled=false;shirt.userData.sleeves=sleeves;return shirt;
}
function fitShirtSleeve(shirt,arm,s,e){
  const sleeve=arm.sleeve,d=e.clone().sub(s).normalize(),q=new THREE.Quaternion().setFromUnitVectors(V(arm.side,0,0),d),up=V(0,1,0).applyQuaternion(q),front=V(0,0,1).applyQuaternion(q),end=s.clone().addScaledVector(d,.69),pos=shirt.geometry.attributes.position;
  for(let j=0;j<sleeve.count;j++){
    const b=sleeve.boundary[j],radial=up.clone().multiplyScalar(b.cos).addScaledVector(front,b.sin),p3=end.clone().addScaledVector(radial,.207),p2=p3.clone().addScaledVector(d,-.24).addScaledVector(radial,.025);
    for(let row=1;row<=sleeve.rows;row++){
      const t=row/sleeve.rows,u=1-t,a=u*u*u,c=3*u*u*t,f=3*u*t*t,g=t*t*t;
      pos.setXYZ(sleeve.start+(row-1)*sleeve.count+j,a*b.p.x+c*b.control.x+f*p2.x+g*p3.x,a*b.p.y+c*b.control.y+f*p2.y+g*p3.y,a*b.p.z+c*b.control.z+f*p2.z+g*p3.z);
    }
  }
}
const shirt=createShirt(body,[[2.48,.54,.32],[2.65,.62,.35],[2.93,.59,.35],[3.22,.58,.36],[3.53,.65,.375],[3.81,.71,.35],[4.04,.72,.30],[4.17,.59,.25],[4.27,.24,.18]]);
loft(body,[[4.15,.215,.18],[4.33,.185,.175],[4.53,.205,.185]],C.skin);
for(const s of [-1,1]){
  patch(body,[[s*.14,4.36,.16],[s*.34,4.24,.22],[s*.47,4.10,.31],[s*.26,4.03,.36],[s*.15,4.23,.25]],C.shirtLight);
  line(body,[[s*.17,4.32,.20],[s*.26,4.18,.30],[s*.26,4.05,.37]],.009,C.shirtShadow);
}
// Sculpted face: one continuous surface with cheek, eye socket and nose relief.
const head=group(body,0,4.96,.01),headRows=[[-.56,.045,.09,.07,.02],[-.53,.16,.18,.13,.045],[-.46,.27,.25,.20,.035],[-.34,.365,.30,.30,.02],[-.18,.43,.345,.35,0],[0,.455,.35,.38,0],[.18,.445,.33,.39,0],[.34,.39,.285,.34,0],[.48,.27,.20,.23,0],[.56,.015,.02,.02,0]];
head.scale.setScalar(1.045);
const gauss=(x,y,cx,cy,sx,sy)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
function faceZ(x,y){const r=sampleRows(headRows,y);let z=Math.sqrt(Math.max(0,1-(x/r[1])**2))*r[2]+r[4];z+=.027*(gauss(x,y,-.25,-.16,.17,.14)+gauss(x,y,.25,-.16,.17,.14));z-=.022*(gauss(x,y,-.20,.065,.14,.11)+gauss(x,y,.20,.065,.14,.11));z+=.034*gauss(x,y,0,.01,.055,.20)+.075*gauss(x,y,0,-.105,.072,.07)+.018*gauss(x,y,0,-.28,.18,.08);return z;}
loft(head,headRows,C.skin,{vertical:80,radial:96,sculpt:(x,y,z,a)=>V(x,y,Math.cos(a)>0?faceZ(x,y):z)});
const eyes=[];
for(const side of [-1,1]){
  const ear=group(head,side*.452,-.11,-.015);ear.rotation.y=side*.30;
  oval(ear,0,0,0,.105,.165,.071,C.skin);oval(ear,side*.014,.012,.057,.053,.105,.020,C.ear);oval(ear,side*.005,-.055,.062,.043,.055,.025,C.skinLight);
  const eye=group(head,side*.197,.055,.301);eye.rotation.y=side*.17;
  oval(eye,0,0,0,.125,.065,.030,C.ivory);
  const gaze=group(eye,-side*.008,.006,.025);oval(gaze,0,0,0,.047,.055,.012,'#334553');oval(gaze,0,0,.009,.032,.042,.008,'#182637');oval(gaze,-.015,.025,.015,.008,.011,.005,'#ffffff');eyes.push({eye,gaze});
  line(eye,[[-.124,.002,.003],[-.085,.052,.020],[0,.066,.023],[.085,.053,.018],[.124,.003,.002]],.008,'#513d38');
  line(eye,[[side*.10,.055,.018],[side*.155,.045,.005]],.008,'#3b3440');
  line(eye,[[-.11,-.036,.013],[0,-.060,.022],[.11,-.036,.013]],.004,'#ca8e77');
  const brow=[];for(let i=0;i<9;i++){const x=side*(.10+i*.023),y=.218+Math.sin(i/8*Math.PI)*.022-i*.003;brow.push([x,y,faceZ(x,y)+.014]);}line(head,brow,.020,C.hair);
  const blushMat=new THREE.MeshBasicMaterial({color:'#dc8170',transparent:true,opacity:.12,depthWrite:false});const blush=oval(head,side*.285,-.17,faceZ(side*.285,-.17)+.004,.065,.032,.008,blushMat);blush.castShadow=false;blush.receiveShadow=false;
}
line(head,[[-.049,-.142,faceZ(-.049,-.142)+.004],[-.039,-.155,faceZ(-.039,-.155)+.004]],.006,'#bc826b');
line(head,[[.035,-.151,faceZ(.035,-.151)+.004],[.049,-.140,faceZ(.049,-.14)+.004]],.006,'#bc826b');
const mouthPts=[[-.14,-.285],[-.075,-.31],[0,-.318],[.075,-.307],[.14,-.27]].map(([x,y])=>[x,y,faceZ(x,y)+.006]);line(head,mouthPts,.006,C.lip);line(head,[[-.076,-.332,faceZ(-.076,-.332)+.003],[0,-.337,faceZ(0,-.337)+.004],[.075,-.327,faceZ(.075,-.327)+.003]],.007,'#d58677');
// Simple close-fitting short hair, with no raised locks or extensions.
const hairPos=[],hairIdx=[],hairRows=28,hairCols=64;
for(let i=0;i<=hairRows;i++)for(let j=0;j<=hairCols;j++){const p=j/hairCols*Math.PI*2,front=Math.sin(p),end=1.85-.65*front+.10*Math.cos(p),t=i/hairRows*end;hairPos.push(Math.sin(t)*Math.cos(p)*.473,Math.cos(t)*.585+.014,Math.sin(t)*Math.sin(p)*.405-.018);}
for(let i=0;i<hairRows;i++)for(let j=0;j<hairCols;j++){const a=i*(hairCols+1)+j,b=a+hairCols+1;hairIdx.push(a,a+1,b,a+1,b+1,b);}const hairGeo=new THREE.BufferGeometry();hairGeo.setAttribute('position',new THREE.Float32BufferAttribute(hairPos,3));hairGeo.setIndex(hairIdx);hairGeo.computeVertexNormals();mesh(hairGeo,C.hair,head);
// A low canvas carpenter's cap follows the head through every work pose.
const workCap=group(head,0,.27,-.02),capRows=[[0,.48,.39,.365,0],[.12,.49,.40,.375,-.015],[.26,.42,.35,.32,-.035],[.36,.28,.24,.22,-.045],[.405,.012,.012,.012,-.045]];
workCap.rotation.x=-.06;
loft(workCap,capRows,appearance.cap || '#788367',{vertical:40,radial:64});
loft(workCap,[[-.035,.466,.372,.35,0],[.015,.488,.397,.37,0],[.055,.492,.401,.376,-.005]],appearance.capEdge || '#596850',{vertical:10,radial:64});
for(let panel=0;panel<6;panel++){
  const a=panel*Math.PI/3,points=[];
  for(let j=0;j<18;j++){const y=lerp(.058,.397,j/17),r=sampleRows(capRows,y);points.push([Math.sin(a)*r[1]*1.008,y,Math.cos(a)*(Math.cos(a)>=0?r[2]:r[3])*1.008+r[4]]);}
  line(workCap,points,.004,appearance.capSeam || '#a8af93');
}
oval(workCap,0,.409,-.045,.029,.013,.029,appearance.capEdge || '#596850');
const brimPositions=[],brimIndices=[],brimEdge=[],brimRows=8,brimCols=40;
for(let i=0;i<=brimRows;i++)for(let j=0;j<=brimCols;j++){
  const u=i/brimRows,a=lerp(-Math.PI/2,Math.PI/2,j/brimCols),x=Math.sin(a)*lerp(.435,.48,u),y=-.012+.015*u+.028*Math.sin(a)**2,z=Math.cos(a)*lerp(.35,.55,u)+.018;
  brimPositions.push(x,y,z);if(i===brimRows)brimEdge.push([x,y,z]);
  if(i<brimRows&&j<brimCols){const p=i*(brimCols+1)+j,q=p+brimCols+1;brimIndices.push(p,q,p+1,p+1,q,q+1);}
}
const brimGeometry=new THREE.BufferGeometry();brimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(brimPositions,3));brimGeometry.setIndex(brimIndices);brimGeometry.computeVertexNormals();const brimMaterial=mat(appearance.capBrim || '#687657').clone();brimMaterial.side=THREE.DoubleSide;mesh(brimGeometry,brimMaterial,workCap);line(workCap,brimEdge,.011,appearance.capEdge || '#596850');
// Apron cut as a curved cloth panel, with real depth around the waist.
function cloth(parent,top,bottom,widthTop,widthBottom,z,color,bulge=.05){const positions=[],indices=[],rows=30,cols=30;for(let i=0;i<=rows;i++){const t=i/rows,y=lerp(top,bottom,t),w=lerp(widthTop,widthBottom,t);for(let j=0;j<=cols;j++){const u=j/cols*2-1;positions.push(u*w,y,z+bulge*(1-u*u)+.010*Math.sin(u*9+t*3)*t*t);}if(i<rows)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();const material=mat(color).clone();material.side=THREE.DoubleSide;return mesh(geo,material,parent);}
cloth(body,3.99,3.04,.40,.59,.365,C.apron,.065);cloth(body,3.08,1.83,.60,.76,.35,C.apron,.085);
line(body,[[-.76,1.85,.355],[0,1.83,.435],[.76,1.85,.355]],.010,C.apronEdge);
for(const s of [-1,1]){
  line(body,[[s*.40,3.98,.371],[s*.49,3.53,.375],[s*.59,3.06,.37],[s*.68,2.44,.37],[s*.75,1.86,.36]],.007,C.apronEdge);
  ribbon(body,[[s*.36,3.99,.40],[s*.40,4.18,.24],[s*.41,4.22,-.02],[s*.40,4.08,-.29],[s*.29,3.05,-.335]],.11,C.apron);
  const rivet=cylinder(body,s*.36,3.93,.413,.035,.035,.020,mat(C.brass,.35));rivet.rotation.x=Math.PI/2;
}
const beltPoints=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;beltPoints.push([Math.sin(a)*.605,3.06,Math.cos(a)*.375]);}line(body,beltPoints,.046,C.apron);
const bow=group(body,.48,3.04,-.29);line(bow,[[0,0,0],[.17,.10,-.025],[.23,-.015,-.03],[.08,-.06,0],[0,0,0]],.035,C.apron);line(bow,[[0,0,0],[-.11,.10,-.02],[-.19,.01,-.04],[-.07,-.05,0],[0,0,0]],.032,C.apron);ribbon(bow,[[0,0,0],[.13,-.16,.01],[.08,-.39,.05]],.075,C.apron);ribbon(bow,[[0,0,0],[-.03,-.17,.01],[-.13,-.31,.03]],.07,C.apron);
const chestPocket=group(body,.13,3.55,.435);cloth(chestPocket,.11,-.18,.15,.14,.013,C.pocket,.018);line(chestPocket,[[-.148,.10,.034],[0,.09,.052],[.148,.10,.034]],.007,'#6faaa5');
for(const x of [-.36,.34]){const pocket=group(body,x,2.40,.405);cloth(pocket,.18,-.27,.23,.21,0,C.apronEdge,.024);line(pocket,[[-.22,.17,.012],[0,.16,.035],[.22,.17,.012]],.007,'#5d9698');line(pocket,[[-.21,-.26,.012],[0,-.27,.032],[.21,-.26,.012]],.006,'#4a8b93');}
const pencil=group(chestPocket,.055,.16,.026);pencil.rotation.z=-.10;cylinder(pencil,0,0,0,.017,.017,.27,'#e7b64f');cylinder(pencil,0,.15,0,.018,.018,.035,'#e9b9a2');cylinder(pencil,0,.126,0,.019,.019,.022,'#d4b66c');
// Legs, trousers and Chelsea-style boots.
const legs=[];
oval(body,0,2.58,0,.61,.35,.335,C.pants);
for(const side of [-1,1]){
  const hip=group(rig,side*.35,2.65,0),knee=group(hip,0,-1.12,0),ankle=group(knee,0,-1.11,0);
  const trouser=tubeRig(rig,C.pants,u=>{const r=u<.12?lerp(.28,.335,u/.12):u<.48?lerp(.335,.245,(u-.12)/.36):lerp(.245,.198,(u-.48)/.52);return[r+.009*Math.sin(u*24)*Math.sin(Math.PI*u),r*.95];});
  cylinder(ankle,0,.07,0,.216,.211,.15,C.pantsLight);
  const boot=group(ankle,0,-.06,.02);boot.scale.set(1.14,1,1.06);
  loft(boot,[[-.29,.17,.26,.16,.08],[-.22,.19,.32,.17,.10],[-.12,.18,.32,.16,.08],[0,.15,.18,.15,.01],[.22,.135,.13,.13,0]],C.boot,{vertical:36,radial:48});
  const sole=roundedBox(boot,.41,.08,.65,.045,C.sole,0,-.30,.11);roundedBox(boot,.36,.075,.24,.02,C.sole,0,-.34,-.065);
  for(const s of [-1,1]){const elastic=oval(boot,s*.143,.035,.006,.012,.135,.094,'#514f47');elastic.rotation.z=s*.06;}
  line(boot,[[-.16,-.20,.24],[0,-.19,.31],[.16,-.20,.24]],.007,'#9c8665');
  const pull=roundedBox(boot,.052,.09,.035,.01,C.boot,0,.23,-.11);pull.rotation.x=.1;
  legs.push({hip,knee,ankle,sole:boot,trouser});
}
// Articulated hands and continuous arm surfaces.
const arms=[];
for(const side of [-1,1]){
  const shoulder=group(body,side*.63,4.04,.015),elbow=group(shoulder,0,-.84,0),wrist=group(elbow,0,-.77,0);
  const skin=tubeRig(body,C.skin,u=>[lerp(.175,.098,u)+.025*Math.sin(Math.PI*u),lerp(.164,.094,u)]);
  const sleeve=shirt.userData.sleeves.find(s=>s.side===side);
  const cuff=group(shoulder,0,-.69,0);cylinder(cuff,0,0,0,.216,.210,.13,C.shirtLight);cylinder(cuff,0,-.055,0,.214,.214,.025,C.shirt);
  oval(wrist,0,-.015,0,.10,.09,.095,C.skin);
  const palm=oval(wrist,0,-.13,.003,.12,.153,.077,C.skin),fingers=[];
  for(let i=0;i<4;i++){
    const length=[.18,.215,.20,.155][i],knuckle=group(wrist,(i-1.5)*.053,-.25,.006);
    cap(knuckle,0,-length*.22,0,.029,length*.64,C.skin);
    const tip=group(knuckle,0,-length*.49,0);cap(tip,0,-length*.18,0,.027,length*.55,C.skin);
    oval(tip,0,-length*.28,-.025,.016,.025,.005,'#f1c6ad');fingers.push({knuckle,tip});
  }
  const thumb=group(wrist,-side*.112,-.11,.024);thumb.rotation.z=-side*.60;cap(thumb,0,-.044,0,.04,.14,C.skin);const thumbTip=group(thumb,0,-.087,0);cap(thumbTip,0,-.029,0,.035,.102,C.skin);
  const socket=group(wrist,0,-.20,.085);arms.push({side,shoulder,elbow,wrist,skin,sleeve,cuff,palm,fingers,thumb,thumbTip,socket});
}
const tool=group(parent);tool.scale.setScalar(.5);tool.visible=false;
roundedBox(tool,.58,.085,.22,.018,'#535a56',0,0,0);roundedBox(tool,.48,.055,.18,.012,'#a77a4d',0,.06,0);const planeHandle=line(tool,[[-.17,.07,0],[-.19,.25,0],[-.11,.29,0],[-.065,.10,0]],.034,'#765035');oval(tool,.19,.13,0,.047,.06,.06,'#8b613d');const planeBlade=roundedBox(tool,.07,.17,.13,.01,'#9ba5a3',-.015,.12,0);planeBlade.rotation.z=-.25;
const groundBox=new THREE.Box3(),down=V(0,-1,0),rollAxis=V(0,1,0),radians=THREE.MathUtils.degToRad;
// Conservative animation limits in the forearm's local frame, including transitions.
const wristLimits={flex:radians(35),extension:radians(25),side:radians(18),twist:radians(10),forearmRoll:radians(65)};
function wristComponents(rotation){
  const q=rotation.clone().normalize();if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
  const twist=new THREE.Quaternion(0,q.y,0,q.w);if(twist.lengthSq()<1e-10)twist.identity();else twist.normalize();
  const swing=q.clone().multiply(twist.clone().invert()).normalize(),length=Math.hypot(swing.x,swing.z),angle=2*Math.atan2(length,swing.w),factor=length>1e-8?angle/length:0;
  return{x:swing.x*factor,z:swing.z*factor,twist:2*Math.atan2(twist.y,twist.w)};
}
function constrainWrist(rotation){
  const a=wristComponents(rotation),xLimit=a.x<0?wristLimits.flex:wristLimits.extension,ellipse=Math.hypot(a.x/xLimit,a.z/wristLimits.side);
  if(ellipse>1){a.x/=ellipse;a.z/=ellipse;}
  a.twist=clamp(a.twist,-wristLimits.twist,wristLimits.twist);
  const angle=Math.hypot(a.x,a.z),swing=angle>1e-8?new THREE.Quaternion().setFromAxisAngle(V(a.x/angle,0,a.z/angle),angle):new THREE.Quaternion();
  return swing.multiply(new THREE.Quaternion().setFromAxisAngle(rollAxis,a.twist));
}
function armIK(arm,target,handRotation,curl,dt,tracking=0,greeting=null){
  const desiredWorld=handRotation.clone(),bodyWorld=body.getWorldQuaternion(new THREE.Quaternion()),desiredLocal=bodyWorld.clone().invert().multiply(desiredWorld),localTarget=body.worldToLocal(target.clone()),s=arm.shoulder.position;
  let handLocal=desiredLocal.clone(),upperQ=new THREE.Quaternion(),lowerQ=new THREE.Quaternion();
  // Re-solve contact with the constrained hand orientation, rather than bending the wrist to reach it.
  for(let iteration=0;iteration<6;iteration++){
    const wristTarget=localTarget.clone().sub(arm.socket.position.clone().applyQuaternion(handLocal)),d=wristTarget.sub(s),length=clamp(d.length(),.43,1.60),u=d.normalize(),a=(.84*.84-.77*.77+length*length)/(2*length),h=Math.sqrt(Math.max(0,.84*.84-a*a)),pole=V(arm.side*.55,-1,-.2),bend=pole.addScaledVector(u,-pole.dot(u)).normalize(),joint=s.clone().addScaledVector(u,a).addScaledVector(bend,h),end=s.clone().addScaledVector(u,length);
    upperQ.setFromUnitVectors(down,joint.clone().sub(s).normalize());lowerQ.setFromUnitVectors(down,end.sub(joint).normalize());
    const wanted=lowerQ.clone().invert().multiply(desiredLocal),roll=clamp(wristComponents(wanted).twist,-wristLimits.forearmRoll,wristLimits.forearmRoll);
    lowerQ.multiply(new THREE.Quaternion().setFromAxisAngle(rollAxis,roll));
    handLocal=lowerQ.clone().multiply(constrainWrist(lowerQ.clone().invert().multiply(desiredLocal)));
  }
  const elbowQ=upperQ.clone().invert().multiply(lowerQ);
  let gestureWrist=null;
  if(greeting?.amount>0){
    // Author this open-hand gesture in joint space: an IK reach passing above
    // the elbow can otherwise flip the forearm's roll during the lift.
    const {amount,sway}=greeting;
    const raisedShoulder=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.10,0,.78));
    const raisedElbow=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,2.37+sway*.16));
    const relaxedWrist=new THREE.Quaternion().setFromEuler(new THREE.Euler(.02,0,-sway*.035));
    gestureWrist=constrainWrist(lowerQ.clone().invert().multiply(desiredLocal)).slerp(relaxedWrist,amount);
    upperQ.slerp(raisedShoulder,amount);elbowQ.slerp(raisedElbow,amount);
  }
  const k=lerp(1-Math.exp(-dt*12),1,tracking);arm.shoulder.quaternion.slerp(upperQ,k);arm.elbow.quaternion.slerp(elbowQ,k);arm.elbow.updateWorldMatrix(true,false);
  const localWanted=gestureWrist??arm.elbow.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desiredWorld);
  arm.wrist.quaternion.slerp(constrainWrist(localWanted),k);arm.wrist.quaternion.copy(constrainWrist(arm.wrist.quaternion));
  arm.wristAngles=wristComponents(arm.wrist.quaternion);
  for(const [i,f]of arm.fingers.entries()){f.knuckle.rotation.x=-curl*(.65+i*.025);f.tip.rotation.x=-curl*.85;}arm.thumb.rotation.x=-curl*.5;arm.thumbTip.rotation.x=-curl*.45;
}

function updateMeshes(){
  rig.updateMatrixWorld(true);
  for(const arm of arms){const local=node=>body.worldToLocal(node.getWorldPosition(V())),s=local(arm.shoulder),e=local(arm.elbow),w=local(arm.wrist);bendTube(arm.skin,[s.clone().lerp(e,.72),e,e.clone().lerp(w,.45),w]);fitShirtSleeve(shirt,arm,s,e);}
  shirt.geometry.attributes.position.needsUpdate=true;shirt.geometry.computeVertexNormals();
  for(const leg of legs){const local=node=>rig.worldToLocal(node.getWorldPosition(V())),h=local(leg.hip),k=local(leg.knee),a=local(leg.ankle);bendTube(leg.trouser,[h,h.clone().lerp(k,.5),k,k.clone().lerp(a,.5),a]);}
}
return{group:rig,spine,body,head,arms,plane:tool,poseArm:armIK,updateMeshes,eyes:eyes.map(({eye,gaze})=>({eye,pupil:gaze})),legs:legs.map(l=>{l.hip.userData={knee:l.knee,ankle:l.ankle,sole:l.sole,tube:l.trouser};return l.hip;})};
}
const maker=refinedCarpenter(room);maker.group.name='Nora';maker.group.position.set(-.65,.13,-1.03);maker.group.scale.setScalar(.5);
function updateSoftSilhouette(){maker.updateMeshes();}
const toolParent=maker.arms[1].socket;
const sawTool=group(toolParent);
const sawHandle=new THREE.Mesh(new THREE.TorusGeometry(.075,.023,6,18),mat('#9b623c'));sawHandle.rotation.y=Math.PI/2;sawTool.add(sawHandle);
box(.022,.145,.48,'#9dafa2',sawTool,0,-.095,.275,.007);
for(let i=0;i<9;i++){const tooth=mesh(new THREE.ConeGeometry(.018,.04,3),palette.metal,sawTool,0,-.181,.07+i*.048);tooth.rotation.x=Math.PI;}
const planeTool=maker.plane;
const hammerTool=group(toolParent);cyl(.027,.028,.28,palette.wood,hammerTool,0,-.07,0,8);box(.24,.105,.12,palette.metal,hammerTool,0,-.235,0,.018);
const sandingTool=group(toolParent);box(.22,.07,.2,'#9f7042',sandingTool,0,-.055,0,.015);box(.225,.012,.205,'#d8c399',sandingTool,0,-.095,0,.003);
const chiselTool=group(toolParent);cyl(.033,.039,.13,palette.edge,chiselTool,0,-.025,0,10);box(.028,.19,.018,'#81978a',chiselTool,0,-.18,0,.003);
const toolMap={saw:sawTool,plane:planeTool,hammer:hammerTool,sand:sandingTool,carve:chiselTool};
for(const tool of [sawTool,hammerTool,sandingTool,chiselTool])tool.scale.setScalar(2.4);
const downAxis=new THREE.Vector3(0,-1,0),rotationScratch=new THREE.Quaternion();
function solveArm(arm,target,rotation,curl,dt,greeting=null){maker.poseArm(arm,target,rotation,curl,dt,activeClip==='plane'&&!walking?smooth(clipClock/.4):0,greeting);}
// Each stool part has a physical rest position and an assembled position.
const stoolHome=new THREE.Vector3(.65,1.54,-.14),craft=group(room,...stoolHome.toArray()),parts=[];
function part(m,assembled,start,rotation,startRotation,threshold){m.userData={assembled:new THREE.Vector3(...assembled),start:new THREE.Vector3(...start),rotation:new THREE.Euler(...rotation),startRotation:new THREE.Euler(...startRotation),threshold};parts.push(m);return m;}
for(let i=0;i<4;i++){const x=(i%2?1:-1)*.24,z=(i>1?1:-1)*.24;part(cyl(.045,.065,.64,palette.light,craft),[x,.34,z],[-.32+i*.19,.055,.22],[z*.13,0,-x*.15],[0,0,Math.PI/2],.22+i*.065);}
for(let i=0;i<4;i++){const isX=i<2,x=isX?0:(i===2?-.25:.25),z=isX?(i===0?-.25:.25):0;part(box(isX?.5:.055,.065,isX?.055:.5,palette.wood,craft),[x,.28,z],[-.23+i*.17,.05,-.24],[0,0,0],[0,isX?.2:Math.PI/2,0],.53+i*.05);}
const seat=part(cyl(.43,.42,.13,palette.pale,craft),[0,.72,0],[.05,.06,-.04],[0,0,0],[0,0,0],.79);
const rings=[];for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.12+i*.095,.0035,4,40),mat(palette.wood));ring.rotation.x=Math.PI/2;ring.position.y=.067;seat.add(ring);rings.push(ring);}
const carvedLeaf=group(seat,.03,.071,.04);carvedLeaf.rotation.y=.4;for(const side of [-1,1]){const leaf=ball(.07,palette.edge,carvedLeaf,side*.045,.001,0,.65,.05,1.6);leaf.rotation.y=side*.3;}carvedLeaf.visible=false;
// The second bay is physical floor space; neither worker shares a bench or aisle.
const extraBay=group(room),apprenticeBench=bench.clone(true),joineryBench=group(extraBay,6,0,-2.6);
extraBay.add(apprenticeBench);apprenticeBench.position.set(6,0,0);
box(4.25,.38,7.1,palette.deep,extraBay,6.425,-.25,0,.1);
box(4.25,.12,7,palette.edge,extraBay,6.425,-.02,0);
for(let row=0;row<20;row++)for(let col=0;col<2;col++)box(2.1,.075,.335,palette.floor[(row+col)%4],extraBay,5.31+col*2.13,.07,(row-9.5)*.345,.014);
box(4.25,2.8,.16,palette.wall,extraBay,6.425,1.51,-3.46);
box(4.3,.17,.24,palette.edge,extraBay,6.425,2.95,-3.46);
for(const x of [4.35,8.4])box(.16,2.8,.2,palette.wood,extraBay,x,1.51,-3.34);
// A dedicated joinery table adds a broad top, trestles, clamps and a dovetail jig.
for(const x of [-1.1,1.1]){
  box(.16,1.25,.64,palette.deep,joineryBench,x,.74,0);
  box(.68,.14,.8,palette.edge,joineryBench,x,.2,0);
}
box(2.9,.22,.92,palette.light,joineryBench,0,1.43,0,.045);
box(2.5,.12,.25,palette.wood,joineryBench,0,.57,0);
box(.72,.14,.55,palette.edge,joineryBench,-.65,1.61,0);
for(let i=0;i<6;i++)box(.035,.16,.19,palette.pale,joineryBench,-.93+i*.11,1.76,.08,.004);
for(const x of [-.94,-.42]){
  beam([x,1.57,-.29],[x,1.96,-.29],.026,palette.metal,joineryBench);
  box(.16,.045,.31,palette.metal,joineryBench,x,1.94,-.16);
  cyl(.055,.055,.1,palette.terra,joineryBench,x,1.99,-.29);
}
box(.75,.06,.2,palette.pale,joineryBench,.63,1.59,0);
for(let i=0;i<3;i++){
  const chisel=group(joineryBench,.39+i*.23,1.62,.02);chisel.rotation.x=Math.PI/2;
  cyl(.04,.045,.2,palette.edge,chisel,0,0,0,10);
  box(.04,.24,.015,palette.metal,chisel,0,-.21,0,.004);
}
const apprentice=refinedCarpenter(room,{shirt:'#c1a15c',shirtLight:'#d5b675',shirtShadow:'#9d8149',apron:'#785c65',apronEdge:'#9c7e85',pocket:'#aa8d88',hair:'#49372e',hairLight:'#655041',cap:'#6c8293',capEdge:'#465d6d',capSeam:'#a6b7bf',capBrim:'#597486',pants:'#424b57',pantsLight:'#5a6570'});
apprentice.group.scale.setScalar(.5);apprentice.group.position.set(5.35,.13,-1.03);
apprentice.group.name='Ada';
const apprenticeTools={plane:apprentice.plane};
for(const name of ['saw','hammer','sand','carve']){
  const tool=toolMap[name].clone(true);apprentice.arms[1].socket.add(tool);apprenticeTools[name]=tool;
}

// The forge is an open stone-floored bay, with a clear apron in front of its hearth.
// Its L-shaped footprint keeps three adult silhouettes readable without a long third row.
const forgeBay=group(room);forgeBay.name='forge-bay';
box(4.25,.38,3.45,palette.deep,forgeBay,6.425,-.25,5.18,.09);
box(4.25,.12,3.45,'#7e8377',forgeBay,6.425,-.02,5.18);
for(let row=0;row<7;row++)for(let col=0;col<8;col++)box(.50,.075,.46,(row+col)%3===0?'#a3a397':'#92998d',forgeBay,4.56+col*.53,.07,3.71+row*.48,.012);
const hearth=group(forgeBay,7.64,0,3.95);
box(1.48,.28,1.13,'#6e746b',hearth,0,.26,0,.055);
box(1.40,.60,1.00,'#85877a',hearth,0,.69,0,.035);
box(1.36,.12,1.10,'#555f59',hearth,0,1.05,.02,.025);
box(1.33,.72,.20,'#72796f',hearth,0,1.42,-.42,.025);
for(const x of [-.58,.58])box(.19,.63,.92,'#777f73',hearth,x,1.42,0,.025);
box(1.48,.22,1.06,'#777f73',hearth,0,1.85,0,.04);
box(.89,.54,.78,'#636c63',hearth,0,2.20,-.08,.035);
box(.65,.45,.63,'#59635b',hearth,0,2.66,-.12,.025);
box(.92,.12,.84,'#4a5750',hearth,0,2.95,-.12,.025);
box(1.01,.09,.72,'#343e39',hearth,0,1.13,.05,.015);
const coalMaterial=new THREE.MeshStandardMaterial({color:'#6a3426',emissive:'#b95722',emissiveIntensity:.42,roughness:.9});
for(let i=0;i<12;i++)ball(.075,coalMaterial,hearth,(i%4-1.5)*.19,1.20+(i%2)*.025,(Math.floor(i/4)-1)*.16,1,.55,1);
const emberLight=new THREE.PointLight('#ffb56a',.65,2.5,2);emberLight.position.set(0,1.34,.22);hearth.add(emberLight);
// The heat is steady: no flashes, particles, or oscillating light intensity.
const anvil=group(forgeBay,6.05,0,4.55);
cyl(.40,.47,.66,palette.edge,anvil,0,.46,0,12);cyl(.42,.42,.065,'#606962',anvil,0,.80,0,12);
for(const y of [.22,.65]){const band=new THREE.Mesh(new THREE.TorusGeometry(.445,.022,8,24),mat('#53615a'));band.rotation.x=Math.PI/2;band.position.y=y;anvil.add(band);}
box(.72,.16,.49,'#3e4c49',anvil,0,.91,0,.035);box(.34,.30,.30,'#4a5854',anvil,0,1.12,0,.025);
box(.94,.16,.43,'#6f7b73',anvil,.04,1.33,0,.025);
const horn=mesh(new THREE.ConeGeometry(.17,.61,16),mat('#768179',.36),anvil,-.66,1.32,0);horn.rotation.z=Math.PI/2;horn.scale.z=.72;
box(.055,.009,.065,'#35423c',anvil,.32,1.416,.07,.005);
const forgeTable=group(forgeBay,4.92,0,5.45);
for(const x of [-.5,.5])for(const z of [-.29,.29])box(.10,1.24,.10,'#4e5d55',forgeTable,x,.73,z);
box(1.34,.16,.94,'#889084',forgeTable,0,1.42,0,.035);
box(1.15,.07,.68,'#5e6c62',forgeTable,0,.4,0);
for(let i=0;i<4;i++)box(.87,.045,.075,'#56645b',forgeTable,0,.48+i*.055,.03,.008);
const quench=group(forgeBay,8.0,.13,5.83);
cyl(.34,.30,.60,palette.edge,quench,0,.30,0,16);cyl(.325,.325,.024,'#637f7e',quench,0,.60,0,24);
for(const y of [.10,.50]){const band=new THREE.Mesh(new THREE.TorusGeometry(.325,.018,6,24),mat('#46534c'));band.rotation.x=Math.PI/2;band.position.y=y;quench.add(band);}
const forgeRack=group(forgeBay,8.22,0,4.68);
for(const z of [-.35,.35])box(.07,1.49,.07,'#46564e',forgeRack,0,.88,z);
box(.075,.065,.86,'#46564e',forgeRack,0,1.58,0);
for(let i=0;i<3;i++){
  const tool=group(forgeRack,-.07,1.3,-.27+i*.27);
  beam([0,-.3,0],[0,.25,0],.018,palette.metal,tool);
  if(i===0)box(.20,.09,.10,palette.metal,tool,0,-.32,0,.012);
  else for(const s of [-1,1])beam([0,-.05,0],[s*.07,-.38,0],.014,palette.metal,tool);
}
// Ivo is an original fictional adult, using the same approved connected shirt and IK.
const blacksmith=refinedCarpenter(room,{skin:'#bb815f',skinLight:'#d09b76',ear:'#9f6954',lip:'#824c46',shirt:'#77847a',shirtLight:'#97a293',shirtShadow:'#5a685f',apron:'#75523b',apronEdge:'#9a7551',pocket:'#a58259',hair:'#39332c',hairLight:'#54483a',cap:'#7c5d43',capEdge:'#584532',capSeam:'#b49a75',capBrim:'#69503a',pants:'#414943',pantsLight:'#5b665c',boot:'#5b4938',brass:'#c2a276'});
blacksmith.group.scale.setScalar(.5);blacksmith.group.position.set(5.65,.13,3.43);
blacksmith.group.name='Ivo';
// A modest moustache, leather apron palette and dark canvas cap distinguish Ivo.
for(const side of [-1,1]){const moustache=ball(.085,'#39332c',blacksmith.head,side*.064,-.236,.369,1,.34,.23);moustache.rotation.z=side*.14;}
const smithHammer=group(blacksmith.arms[1].socket);smithHammer.scale.setScalar(2);
cyl(.025,.03,.32,palette.edge,smithHammer,0,-.11,0,10);box(.25,.12,.12,'#56655e',smithHammer,0,-.285,0,.02);
const smithTongs=group(blacksmith.arms[0].socket);smithTongs.scale.setScalar(2);
for(const side of [-1,1]){beam([side*.025,.06,0],[-side*.022,-.21,0],.014,'#52625a',smithTongs);beam([-side*.022,-.21,0],[-side*.045,-.34,0],.014,'#52625a',smithTongs);}
ball(.025,'#a3a99b',smithTongs,0,-.12,.015);
const hotStock=box(.22,.035,.065,new THREE.MeshStandardMaterial({color:'#a76c46',emissive:'#b45825',emissiveIntensity:.24,roughness:.7}),smithTongs,0,-.34,0,.008);
const smithTools={hammer:smithHammer,tongs:smithTongs};

// Authored styles affect only object surfaces. Each object owns its materials;
// character palettes and another worker's copy can never be recolored by a job.
const styleMaterials=new Set(),woodColors=new Set([palette.wood,palette.edge,palette.light,palette.pale].map(c=>new THREE.Color(c).getHex()));
function applyObjectStyle(root,patternId,finishStyleId){
  const signature=patternId+':'+finishStyleId;
  if(root.userData.styleSignature===signature)return;
  root.userData.styleSignature=signature;
  const surfaces=[];root.traverse(m=>{if(m.isMesh&&!m.userData.styleOrnament)surfaces.push(m);});
  for(const m of surfaces){
    if(!m.material?.color||m.material.transparent||m.material.emissive?.getHex())continue;
    if(!m.userData.styleBase){
      const wood=woodColors.has(m.material.color.getHex());
      const metal=!wood&&(m.userData.craftSurface==='metal'||m.material.color.getHex()===new THREE.Color(palette.metal).getHex());
      if(!wood&&!metal)continue;
      m.userData.styleBase={color:m.material.color.clone(),roughness:m.material.roughness,wood};
      styleMaterials.add(m.material);m.material=m.material.clone();styleMaterials.add(m.material);
      if(wood){
        m.geometry.computeBoundingBox();const bounds=m.geometry.boundingBox,size=bounds.getSize(new THREE.Vector3());
        if(size.x>.18&&size.z>.12){
          const motifs=group(m,0,bounds.max.y+.005,0);motifs.name='authored-wood-pattern';
          const reed=group(motifs),leaf=group(motifs);m.userData.styleMotifs={reed,leaf};
          for(let i=0;i<3;i++){
            const x=(i-1)*Math.min(.11,size.x*.22),length=Math.min(.32,size.z*.64);
            const points=Array.from({length:9},(_,j)=>new THREE.Vector3(x+Math.sin(j/8*Math.PI*2)*.025,0,(j/8-.5)*length));
            const mark=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),24,.004,4,false),palette.edge,reed);mark.userData.styleOrnament=true;
          }
          const stem=box(.008,.004,Math.min(.4,size.z*.72),palette.edge,leaf,0,0,0,.001);stem.userData.styleOrnament=true;
          for(const side of [-1,1])for(let i=0;i<2;i++){const shape=ball(Math.min(.045,size.x*.11),palette.edge,leaf,side*.035,.001,(i-.5)*Math.min(.14,size.z*.25),.68,.05,1.5);shape.rotation.y=side*.65;shape.userData.styleOrnament=true;}
        }
      }
    }
    const base=m.userData.styleBase;m.material.color.copy(base.color);m.material.roughness=base.roughness;
    if(finishStyleId!=='natural'){
      const tint=new THREE.Color(finishStyleId==='warm-honey'?(base.wood?'#bd8846':'#93825a'):(base.wood?'#6e8499':'#4f647e'));
      const hsl={};base.color.getHSL(hsl);m.material.color.copy(tint).multiplyScalar(.70+hsl.l*.54);m.material.roughness=.50;
    }
    const motifs=m.userData.styleMotifs;if(motifs){motifs.reed.visible=patternId==='carved-ripples';motifs.leaf.visible=patternId==='carved-leaves';}
  }
}

// Each recipe has a stable physical assembly, with loose parts that settle in place.
// All meshes stay attached until dispose, so switching recipes never leaks GPU assets.
const recipeHeights={'wooden-spoon':.11,stool:.785,birdhouse:.9,'wall-shelf':.7,'keepsake-box':.52,'toy-boat':.87,'dining-chair':1.12,'writing-desk':.79,cabinet:1.03,'hinge-set':.13,'tool-head':.18,lantern:.72,'iron-stand':.85,'reinforced-chest':.56,'garden-bench':.82,'standing-lamp':1.2};
function createRecipeModels(parent,offset=0){
  const models={};
  for(const id of [...RECIPES,'neighborhood-greenhouse']){
    if(id==='stool'&&offset===0)continue;
    const model=group(parent,.65+offset,1.54,-.14),pieces=[];
    let count=0,component=MIXED_RECIPES.has(id)?'wood':(['hinge-set','tool-head','lantern','iron-stand'].includes(id)?'metal':null);
    function add(m){
      const target=m.position.clone(),rotation=m.rotation.clone(),index=count++;
      const start=new THREE.Vector3((index%4-1.5)*.16,.04+(index%3)*.018,(Math.floor(index/4)%3-1)*.16);
      m.userData.craftSurface=component==='frame'||component==='metal'?'metal':null;
      pieces.push({mesh:m,target,rotation,start,component,threshold:Math.min(.8,.12+index*.045)});return m;
    }
    const b=(w,h,d,x,y,z,color=palette.light)=>add(box(w,h,d,color,model,x,y,z,.016));
    const post=(x,z,h=.65)=>b(.075,h,.075,x,h/2,z,palette.wood);
    if(id==='neighborhood-greenhouse'){
      component='panel-a';
      for(const x of [-.36,.36])b(.055,.08,.84,x,.06,0,palette.wood);
      for(let i=0;i<5;i++)b(.76,.045,.12,0,.115,-.30+i*.15);
      component='panel-b';
      for(const x of [-.36,.36])b(.055,.08,.84,x,.20,0,palette.wood);
      for(let i=0;i<5;i++)b(.76,.045,.12,0,.255,-.30+i*.15);
      component='frame';
      for(const x of [-.37,.37])b(.045,.58,.045,x,.34,-.26,palette.metal);
      b(.78,.045,.045,0,.61,-.26,palette.metal);
    }else if(id==='stool'){
      for(const x of [-.24,.24])for(const z of [-.24,.24])post(x,z);
      add(cyl(.43,.42,.13,palette.pale,model,0,.72,0));
      for(const z of [-.24,.24])b(.5,.055,.055,0,.28,z);
    }else if(id==='wooden-spoon'){
      b(.10,.055,.68,0,.055,-.19,palette.pale);
      const bowl=add(ball(.22,palette.light,model,0,.055,.23,1,.24,1.28));
      const hollow=ball(.17,palette.edge,bowl,0,.044,.015,1,.035,1.24);hollow.castShadow=false;
    }else if(id==='birdhouse'){
      b(.7,.07,.62,0,.055,0);b(.055,.54,.53,-.29,.34,0);b(.055,.54,.53,.29,.34,0);b(.58,.54,.055,0,.34,-.25);
      const front=b(.58,.54,.055,0,.34,.25,palette.pale);
      const hole=add(cyl(.105,.105,.012,palette.edge,model,0,.39,.285,24));hole.rotation.x=Math.PI/2;
      for(const side of [-1,1]){const roof=b(.48,.075,.78,side*.19,.72,0,palette.wood);roof.rotation.z=-side*.52;}
      b(.055,.055,.21,0,.19,.37);
    }else if(id==='wall-shelf'){
      b(1.04,.075,.48,0,.08,0);b(1.04,.075,.48,0,.66,0);
      for(const x of [-.45,.45])b(.07,.58,.44,x,.37,0,palette.wood);
      b(.95,.59,.045,0,.37,-.21,palette.edge);
      for(const x of [-.29,.29]){const bracket=b(.06,.27,.06,x,.18,-.12,palette.deep);bracket.rotation.x=-.6;}
    }else if(id==='keepsake-box'){
      b(.82,.06,.62,0,.05,0);for(const x of [-.38,.38])b(.055,.36,.6,x,.25,0);
      for(const z of [-.28,.28])b(.75,.36,.055,0,.25,z);
      b(.86,.08,.66,0,.48,0,palette.pale);b(.12,.10,.04,0,.37,.32,palette.metal);
      for(const x of [-.21,.21])b(.09,.055,.06,x,.43,-.32,palette.metal);
    }else if(id==='toy-boat'){
      const hull=add(ball(.4,palette.wood,model,0,.14,0,1.35,.35,.62));
      b(.98,.045,.36,0,.23,0,palette.pale);post(0,0,.85);
      const sail=mesh(new THREE.BufferGeometry(),palette.cream,model);
      sail.geometry.setAttribute('position',new THREE.Float32BufferAttribute([.045,.81,0,.045,.31,0,.43,.31,0],3));sail.geometry.setIndex([0,1,2,2,1,0]);sail.geometry.computeVertexNormals();add(sail);
      b(.12,.065,.15,-.34,.28,0,palette.terra);
    }else if(id==='dining-chair'){
      for(const x of [-.27,.27])for(const z of [-.25,.25])post(x,z,z<0?1.1:.58);
      b(.67,.10,.64,0,.61,0,palette.pale);
      for(const x of [-.16,0,.16])b(.055,.40,.055,x,.88,-.25);
      b(.66,.09,.085,0,1.075,-.25,palette.wood);
      for(const z of [-.25,.25])b(.56,.06,.06,0,.25,z);
    }else if(id==='writing-desk'){
      for(const x of [-.55,.55])for(const z of [-.29,.29])post(x,z,.70);
      b(1.36,.09,.83,0,.745,0,palette.pale);
      b(1.1,.23,.55,0,.57,0);b(.53,.18,.06,-.28,.57,.31,palette.wood);b(.53,.18,.06,.28,.57,.31,palette.wood);
      for(const x of [-.28,.28])b(.13,.035,.04,x,.57,.36,palette.metal);
      b(1.15,.06,.07,0,.22,-.27,palette.wood);
    }else if(id==='cabinet'){
      for(const x of [-.39,.39])for(const z of [-.23,.23])post(x,z,.18);
      b(.99,.075,.64,0,.19,0);b(.99,.075,.64,0,.99,0,palette.pale);
      for(const x of [-.45,.45])b(.07,.76,.59,x,.59,0);
      b(.87,.74,.045,0,.59,-.28,palette.edge);b(.88,.06,.54,0,.59,0);
      for(const x of [-.22,.22]){
        b(.42,.72,.055,x,.59,.30,palette.wood);b(.32,.56,.025,x,.59,.338,palette.light);
        b(.035,.10,.045,x<0?-.065:.065,.60,.37,palette.metal);
      }
    }else if(id==='hinge-set'){
      for(const x of [-.29,.29]){
        for(const side of [-1,1]){
          b(.20,.045,.32,x+side*.11,.07,0,'#69776e');
          for(const z of [-.10,.10])add(ball(.022,'#b0b6a5',model,x+side*.14,.098,z,1,.28,1));
        }
        const barrel=add(cyl(.043,.043,.36,'#48594f',model,x,.085,0,12));barrel.rotation.x=Math.PI/2;
      }
    }else if(id==='tool-head'){
      b(.69,.22,.23,0,.14,0,'#596b61');b(.10,.26,.28,-.34,.14,0,'#8a9587');
      const peen=b(.23,.12,.18,.42,.14,0,'#6e7c70');peen.rotation.z=.12;
      // Dark inset socket reads as an unhandled tool head rather than a hammer.
      b(.13,.012,.12,0,.257,0,'#293f36');
    }else if(id==='lantern'){
      b(.43,.06,.39,0,.06,0,'#506154');
      for(const x of [-.17,.17])for(const z of [-.15,.15])b(.035,.46,.035,x,.31,z,'#627164');
      const glass=new THREE.MeshStandardMaterial({color:'#e8cd86',transparent:true,opacity:.30,roughness:.35,depthWrite:false});
      add(box(.29,.36,.27,glass,model,0,.31,0,.012));
      b(.45,.065,.41,0,.57,0,'#4d6152');
      add(cyl(.05,.25,.16,'#647869',model,0,.675,0,4));
      const loop=add(mesh(new THREE.TorusGeometry(.11,.018,8,24),mat('#536a59'),model,0,.83,0));
      add(cyl(.045,.06,.12,'#ddb565',model,0,.17,0,10));
    }else if(id==='iron-stand'){
      for(const x of [-.27,.27])for(const z of [-.24,.24])add(beam([x*1.12,.04,z*1.12],[x*.85,.75,z*.85],.025,'#4e6557',model));
      for(const y of [.25,.76]){
        const ring=add(mesh(new THREE.TorusGeometry(y>.5?.34:.27,.026,8,32),mat('#61786a'),model,0,y,0));ring.rotation.x=Math.PI/2;
      }
      b(.67,.055,.60,0,.79,0,'#718374');
      for(const x of [-.22,.22])b(.035,.07,.54,x,.84,0,'#485e50');
    }else if(id==='reinforced-chest'){
      b(.90,.065,.64,0,.05,0);for(const x of [-.42,.42])b(.055,.38,.60,x,.27,0);
      for(const z of [-.29,.29]){b(.79,.38,.055,0,.27,z,palette.wood);for(let i=0;i<3;i++)b(.77,.012,.006,0,.15+i*.12,z+.03);}
      b(.94,.09,.68,0,.51,0,palette.pale);
      component='metal';
      for(const x of [-.30,.30]){
        for(const z of [-.325,.325])b(.075,.45,.025,x,.27,z,'#506052');
        b(.075,.024,.67,x,.565,0,'#5c6f5d');
        for(const z of [-.34,.34])add(ball(.018,'#c2af78',model,x,.21,z,1,1,.4));
      }
      b(.12,.16,.035,0,.35,.34,'#485b4c');b(.065,.055,.045,0,.36,.367,'#b6a16e');
    }else if(id==='garden-bench'){
      for(let i=0;i<4;i++)b(1.35,.065,.12,0,.47,-.22+i*.145,palette.light);
      for(let i=0;i<3;i++)b(1.35,.09,.045,0,.62+i*.11,-.27,palette.pale);
      component='metal';
      for(const x of [-.49,.49]){
        for(const z of [-.22,.22])add(beam([x,.03,z*1.2],[x,.44,z],.03,'#4b6453',model));
        b(.045,.39,.045,x,.62,-.27,'#506e58');b(.055,.05,.58,x,.43,0,'#506e58');
        b(.055,.055,.48,x,.64,.03,'#5d7961');b(.045,.19,.045,x,.55,.24,'#506e58');
      }
      b(.98,.035,.035,0,.20,-.18,'#4b6453');
    }else if(id==='standing-lamp'){
      add(cyl(.31,.34,.07,palette.wood,model,0,.055,0,24));
      add(cyl(.038,.047,.87,palette.light,model,0,.51,0,16));
      component='metal';
      add(cyl(.20,.25,.045,'#4b6454',model,0,.10,0,24));
      add(cyl(.062,.062,.13,'#9c926c',model,0,.91,0,16));
      add(cyl(.18,.35,.30,'#7b8b6e',model,0,1.12,0,24));
      const rim=add(mesh(new THREE.TorusGeometry(.35,.018,8,32),mat('#536b58'),model,0,.97,0));rim.rotation.x=Math.PI/2;
      add(ball(.066,'#edcf86',model,0,1.01,0,1,1.2,1));
      add(beam([.12,.95,.02],[.12,.70,.02],.008,'#bdab7a',model));
    }
    for(const item of pieces){
      item.rotation.copy(item.mesh.rotation);item.mesh.geometry.computeBoundingBox();
      const bounds=item.mesh.geometry.boundingBox.clone(),size=bounds.getSize(new THREE.Vector3()).multiply(item.mesh.scale);
      const rest=item.rotation.clone();
      if(size.y>Math.min(size.x,size.z)){
        if(size.x<size.z)rest.z+=Math.PI/2;else rest.x+=Math.PI/2;
      }
      item.restQuaternion=new THREE.Quaternion().setFromEuler(rest);item.targetQuaternion=new THREE.Quaternion().setFromEuler(item.rotation);
      const matrix=new THREE.Matrix4().compose(new THREE.Vector3(),item.restQuaternion,item.mesh.scale);
      item.start.y=.018-bounds.applyMatrix4(matrix).min.y;
    }
    model.visible=false;models[id]={group:model,pieces};
  }
  return models;
}
const recipeModels=createRecipeModels(room),apprenticeRecipes=createRecipeModels(room,6),smithRecipes=createRecipeModels(forgeBay);
for(const model of Object.values(smithRecipes))model.group.position.set(4.92,1.54,5.45);
function updateRecipeModels(models,id,progress,stageProgress=null,stageId=null,patternId='plain',finishStyleId='natural'){
  for(const [key,model] of Object.entries(models)){
    model.group.visible=key===id;
    if(!model.group.visible)continue;
    applyObjectStyle(model.group, patternId, finishStyleId);
    for(const item of model.pieces){
      // Legacy callers retain overall progress. Stage-aware callers keep independent
      // wood and metal assemblies apart until the explicit assembly stage advances.
      const mixed=MIXED_RECIPES.has(id),community=id==='neighborhood-greenhouse',hasStages=stageProgress&&Object.keys(stageProgress).length>0;
      // A shared mixed job can occupy both stations without duplicating its full
      // object: component work shows that station's wood or metal pieces only.
      item.mesh.visible=community ? (stageId==='assemble'||item.component===stageId) : !mixed||!['wood','metal'].includes(stageId)||item.component===stageId;
      const componentProgress=hasStages&&item.component?(stageProgress[item.component]??0):progress;
      const k=smooth((componentProgress-item.threshold)/.16);
      item.mesh.position.lerpVectors(item.start,item.target,k);
      if(mixed&&hasStages){
        const assembled=fraction(stageProgress.assemble??(['d1','d2'].includes(stageId)?1:0));
        item.mesh.position.x+=(item.component==='metal'?.24:-.20)*(1-assembled)*k;
        item.mesh.position.z+=(item.component==='metal'?.12:-.06)*(1-assembled)*k;
      }
      // Loose components rest on the worktop; assembly uses no game clock.
      item.mesh.quaternion.slerpQuaternions(item.restQuaternion,item.targetQuaternion,k);
    }
  }
}

// The open craft yard wraps in front of the workshop, keeping the full crew
// in one composition instead of stretching them across five distant bays.
const yardBay=group(room);yardBay.name='craft-yard';
box(8.65,.38,5.15,palette.deep,yardBay,0,-.25,6.05,.10);
box(8.55,.12,5.05,'#b6aa8c',yardBay,0,-.02,6.05);
for(let row=0;row<9;row++)for(let col=0;col<14;col++)box(.58,.045,.50,(row+col)%3?'#bfb79d':'#d2c7aa',yardBay,-3.96+col*.61,.07,3.88+row*.54,.012);
for(const z of [4.0,5.4,6.8,8.1]){box(.10,.92,.10,palette.deep,yardBay,-4.15,.53,z);box(.09,.11,1.46,palette.wood,yardBay,-4.15,.79,z-.13);}
const yardWorkers=[];
const yardAppearances=[
  {id:'carver',name:'Mara',x:-2.05,z:4.12,colors:{skin:'#a86e51',skinLight:'#c18b68',ear:'#8d5747',lip:'#854e4b',shirt:'#a29c7a',shirtLight:'#bcb294',shirtShadow:'#827c5d',apron:'#915c4c',apronEdge:'#b47e61',pocket:'#bc8d70',hair:'#35343a',hairLight:'#53525b',cap:'#b08b64',capEdge:'#896b4a',capBrim:'#9a7752',capSeam:'#d0b18a',pants:'#485257',pantsLight:'#627076'}},
  {id:'finisher',name:'Lale',x:2.70,z:5.00,colors:{skin:'#e0b68f',skinLight:'#efcba6',ear:'#c58c77',lip:'#a56865',shirt:'#718ea6',shirtLight:'#91adc1',shirtShadow:'#566e86',apron:'#b68b4c',apronEdge:'#d2ad71',pocket:'#dfbd88',hair:'#513b34',hairLight:'#765446',cap:'#7e716f',capEdge:'#5f5456',capBrim:'#756565',capSeam:'#b4a29a',pants:'#555361',pantsLight:'#736f80'}}
];
for(const spec of yardAppearances){
  const rig=refinedCarpenter(yardBay,spec.colors);rig.group.name=spec.name;rig.group.scale.setScalar(.5);
  const workbench=bench.clone(true);yardBay.add(workbench);workbench.position.set(spec.x,0,spec.z);workbench.name=spec.id+'-station';
  const tools={};for(const name of ['carve','sand','hammer','saw']){const tool=toolMap[name].clone(true);rig.arms[1].socket.add(tool);tools[name]=tool;}
  // A plane from the approved rig is already attached to its hand socket.
  tools.plane=rig.plane;
  const models=createRecipeModels(yardBay);for(const model of Object.values(models))model.group.position.add(new THREE.Vector3(spec.x,0,spec.z));
  const worker={...spec,rig,tools,models,clock:0,clip:'idle',progress:0,recipe:null};yardWorkers.push(worker);
  if(spec.id==='carver'){
    for(let i=0;i<3;i++){const chisel=group(workbench,-1.05+i*.17,1.58,.35);box(.035,.035,.23,palette.metal,chisel,0,0,0,.004);box(.07,.065,.17,palette.edge,chisel,0,0,.19);}
    const sample=box(.44,.07,.30,palette.pale,workbench,1.03,1.59,.15,.012);applyObjectStyle(sample,'carved-leaves','natural');
  }else{
    for(let i=0;i<3;i++){cyl(.085,.08,.17,['#c99757','#6e8499',palette.cream][i],workbench,-1.07+i*.23,1.62,.29);cyl(.089,.089,.018,palette.edge,workbench,-1.07+i*.23,1.715,.29);}
    box(.40,.035,.27,palette.cream,workbench,1.10,1.57,.20,.008);
  }
}
// Permanent community project: components grow only from saved stage fractions.
// Plants, glazing and the commemorative display appear only after delivery.
const greenhouseSite=group(yardBay,-2.32,.11,7.16);greenhouseSite.name='neighborhood-greenhouse';
const greenhouseParts=[],greenhouseCompletion=group(greenhouseSite);
box(2.75,.085,2.25,'#8d967f',greenhouseSite,0,0,0,.04);
function greenhousePart(m,stage,threshold=0){greenhouseParts.push({mesh:m,stage,threshold,position:m.position.clone(),scale:m.scale.clone(),rotation:m.rotation.clone()});return m;}
for(const [stage,z] of [['panel-a',-.91],['panel-b',.91]]){
  for(const x of [-1.12,1.12])greenhousePart(box(.10,.80,.10,palette.wood,greenhouseSite,x,.44,z),stage);
  for(let i=0;i<5;i++)greenhousePart(box(2.28,.12,.065,palette.light,greenhouseSite,0,.17+i*.13,z),stage,i*.16);
}
for(const x of [-1.16,1.16])for(const z of [-.94,.94])greenhousePart(box(.065,1.74,.065,palette.metal,greenhouseSite,x,.94,z),'frame');
for(const z of [-.94,0,.94]){
  for(const side of [-1,1])greenhousePart(beam([side*1.16,1.81,z],[0,2.30,z],.034,palette.metal,greenhouseSite),'frame',.30);
}
greenhousePart(box(.065,.065,1.96,palette.metal,greenhouseSite,0,2.30,0),'frame',.55);
for(const x of [-1.16,1.16])greenhousePart(box(.065,.065,1.96,palette.metal,greenhouseSite,x,1.81,0),'frame',.20);
const glazing=new THREE.MeshStandardMaterial({color:'#bed9ca',transparent:true,opacity:.21,roughness:.25,depthWrite:false,side:THREE.DoubleSide});
for(const x of [-1.15,1.15])box(.014,.98,1.86,glazing,greenhouseCompletion,x,1.28,0,.003);
for(const side of [-1,1]){const roof=box(1.27,.018,1.86,glazing,greenhouseCompletion,side*.57,2.055,0,.003);roof.rotation.z=-side*.40;}
for(const x of [-.78,.76]){box(.42,.31,1.38,palette.edge,greenhouseCompletion,x,.24,0);for(const z of [-.44,0,.44])plant(greenhouseCompletion,x,.40,z,.65);}
const dedication=group(greenhouseCompletion,.02,.13,1.18);dedication.name='community-commemorative-display';
box(.075,.58,.075,palette.deep,dedication,0,.29,0);const plaque=box(.68,.33,.065,palette.light,dedication,0,.60,0,.025);plaque.rotation.x=-.17;
// A little five-point maker's mark commemorates the five craftspeople.
for(let i=0;i<5;i++)ball(.032,palette.deep,plaque,(i-2)*.10,.035,.040,1,1,.25);
const sprout=group(plaque,0,-.06,.042);beam([0,-.04,0],[0,.07,0],.008,palette.deep,sprout);for(const side of [-1,1]){const leaf=ball(.036,palette.deep,sprout,side*.027,.02,0,.8,.4,.2);leaf.rotation.z=side*.5;}
function animateYard(dt){
  yardBay.visible=settings.yard;if(!settings.yard)return;
  const project=settings.greenhouse;greenhouseSite.visible=Boolean(project);greenhouseCompletion.visible=project?.status==='delivered';
  if(project)for(const part of greenhouseParts){
    const p=project.status==='delivered'?1:fraction(project.stageProgress[part.stage]),k=smooth((p-part.threshold)/Math.max(.15,1-part.threshold));
    part.mesh.visible=k>0;part.mesh.scale.copy(part.scale);part.mesh.scale.y*=Math.max(.01,k);part.mesh.position.copy(part.position);part.mesh.position.y*=k;
    const assembled=project.status==='delivered'?1:fraction(project.stageProgress.assemble);
    part.mesh.position.x+=(part.stage==='panel-a'?-.24:part.stage==='panel-b'?.24:0)*(1-assembled);
    part.mesh.rotation.copy(part.rotation);
    if(part.stage!=='frame')part.mesh.rotation.z+=(part.stage==='panel-a'?-1:1)*.055*(1-assembled);
  }
  for(const worker of yardWorkers)animateYardWorker(worker,dt);
}

// A handcart remains part of the workshop set.
const cart=group(room,2.8,.12,2.45);box(1.27,.13,1.05,palette.edge,cart,0,.35,0,.035);for(let i=0;i<5;i++)box(.22,.07,.99,palette.light,cart,(i-2)*.245,.44,0,.018);
const wheels=[];for(const x of [-.67,.67])for(const z of [-.36,.36]){const wheel=cyl(.18,.18,.09,palette.deep,cart,x,.18,z,16);wheel.rotation.z=Math.PI/2;wheels.push(wheel);const cap=cyl(.055,.055,.1,palette.light,cart,x,.18,z);cap.rotation.z=Math.PI/2;}
beam([-.46,.4,-.41],[-.46,.94,-.95],.038,palette.deep,cart);beam([.46,.4,-.41],[.46,.94,-.95],.038,palette.deep,cart);beam([-.46,.94,-.95],[.46,.94,-.95],.035,palette.light,cart);
const parcel=group(cart,0,.47,0);box(1.04,.58,.88,palette.wood,parcel,0,.29,0,.03);for(let i=0;i<4;i++){box(.035,.47,.83,palette.light,parcel,-.54,.29,0,.01);box(1.04,.055,.035,palette.light,parcel,0,.12+i*.12,.46,.008);}
const lidPivot=group(parcel,0,.59,-.46);const lid=box(1.11,.08,.97,palette.light,lidPivot,0,0,.45,.025);lidPivot.rotation.x=-1.9;parcel.visible=false;
const ribbon1=box(.09,.016,.94,'#e4d4a0',lid,0,.05,0,.004),ribbon2=box(1.08,.016,.09,'#e4d4a0',lid,0,.05,0,.004);
// Recycled wood shavings, visible only during work.
const shavings=[];for(let i=0;i<24;i++){const m=box(.05,.012,.11,i%2?palette.light:palette.pale,room,0,0,0,.004);m.visible=false;shavings.push(m);}
const footprint=group(scene,0,-.5,0);const aoCanvas=document.createElement('canvas');aoCanvas.width=128;aoCanvas.height=128;const ctx=aoCanvas.getContext('2d');if(ctx){const gradient=ctx.createRadialGradient(64,64,8,64,64,64);gradient.addColorStop(0,'rgba(34,57,38,.30)');gradient.addColorStop(1,'rgba(34,57,38,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);const shadow=mesh(new THREE.PlaneGeometry(13,11),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(aoCanvas),transparent:true,depthWrite:false}),footprint);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;}
let targetAngle=.5,angle=.5,zoom=2.35,goalZoom=2.35,look=new THREE.Vector3(-.25,1.35,-.35),goalLook=new THREE.Vector3(-.25,1.35,-.35),viewWidth=1,viewHeight=1;

function projection(){
  const aspect=viewWidth/viewHeight,portraitBoost=closeView&&viewWidth<500?(settings.yard?1.06:1.12):1;
  const half=Math.max(5.5,6.2/aspect)/(zoom*portraitBoost);
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  camera.updateProjectionMatrix();
}
function resize(){
  viewWidth=Math.max(1,container.clientWidth);viewHeight=Math.max(1,container.clientHeight);
  renderer.setSize(viewWidth,viewHeight,false);projection();invalidate();
}
function cameraUpdate(dt){
  const k=design.motion?1-Math.exp(-dt*6):1;
  angle+=(targetAngle-angle)*k;zoom+=(goalZoom-zoom)*k;look.lerp(goalLook,k);
  camera.position.set(Math.sin(angle)*14+look.x,(closeView?8.4:10.7)+look.y,Math.cos(angle)*14+look.z);
  camera.lookAt(look);projection();
}
function view(){
  closeView=!settings.expanded;goalZoom=closeView?2.35:1;
  if(settings.yard){goalZoom=closeView?1.02:.86;goalLook.set(2.0,1.16,2.38);return;}
  if(settings.forge){goalZoom=closeView?.99:.78;goalLook.set(2.1,1.10,1.20);return;}
  const enlarged=settings.joinery||settings.crew.some(member=>member.status==='active');
  if(enlarged){goalZoom=closeView?1.18:.8;goalLook.set(2.25,1.1,0);return;}
  const resting=settings.activity==='idle';
  goalLook.set(closeView?(resting?-.45:-.25):0,closeView?1.35:.9,closeView?(resting?1.25:-.35):0);
}
let pointerX=null;
function pointerDown(event){
  pointerX=event.clientX;
  try{canvas.setPointerCapture(event.pointerId);}catch{}
}
function pointerMove(event){
  if(pointerX===null)return;
  targetAngle=Math.max(.28,Math.min(1.24,targetAngle-(event.clientX-pointerX)*.004));
  pointerX=event.clientX;invalidate();
}
function pointerUp(){pointerX=null;}
function wheel(event){
  if(!event.ctrlKey&&!event.metaKey)return;
  event.preventDefault();goalZoom=Math.max(.8,Math.min(3.1,goalZoom-event.deltaY*.002));invalidate();
}
function smooth(n){n=Math.min(1,Math.max(0,n));return n*n*(3-2*n);}
function easeGesture(n){n=Math.min(1,Math.max(0,n));return n*n*n*(n*(n*6-15)+10);}
function idleGreeting(time){
  // Lift, acknowledge, then lower. Zero velocity at each boundary keeps the
  // elbow from snapping when a greeting begins or the hand returns to rest.
  const phase=time%16-2.4,raise=.9,hold=1.9,lower=1.05;
  if(phase<=0||phase>=raise+hold+lower)return{amount:0,sway:0};
  const amount=phase<raise?easeGesture(phase/raise):phase>raise+hold?1-easeGesture((phase-raise-hold)/lower):1;
  const u=Math.max(0,Math.min(1,(phase-raise)/hold));
  const sway=Math.sin(u*Math.PI*4)*easeGesture(u/.16)*(1-easeGesture((u-.84)/.16));
  return{amount,sway};
}
function intendedClip(){return settings.activity;}
let impact=0,route=[],gaitClock=0,planingCut=false;
const planeCenter=new THREE.Vector3(-.65,1.642,-.42);
const floorY=.112,footBounds=new THREE.Box3();
const station={saw:[-.8,.13,-1.03],plane:[-.65,.13,-1.03],hammer:[.30,.13,-1.03],sand:[.35,.13,-1.03],carve:[.4,.13,-1.03],idle:[-.5,.13,1.55]};
function planRoute(destination){
  const here=maker.group.position.clone();here.y=.13;route=[];
  if(here.distanceTo(destination)<.025)return;
  // Cross the bench's depth only in the clear right-hand aisle.
  let enter=0,leave=1;
  for(const [axis,bound] of [['x',2.05],['z',1.0]]){
    const d=destination[axis]-here[axis];
    if(Math.abs(d)<.0001){if(Math.abs(here[axis])>bound){enter=2;break;}}
    else{const a=(-bound-here[axis])/d,b=(bound-here[axis])/d;enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));}
  }
  if(enter<=leave){
    if(here.x<2.16)route.push(new THREE.Vector3(2.17,.13,here.z));
    route.push(new THREE.Vector3(2.17,.13,destination.z));
  }
  route.push(destination.clone());
  route=route.filter(v=>v.distanceTo(here)>.025);
}
function animateMaker(t,working,dt){
  const clip=intendedClip();if(clip!==activeClip){activeClip=clip;clipClock=0;planRoute(new THREE.Vector3(...station[clip]));}
  if(design.motion&&route.length===0)clipClock+=dt;
  gaitClock+=dt*(design.motion?1:0);
  const q=clipClock,cycle=Math.sin(q*4.6),motion=design.motion?1:0,pos=new THREE.Vector3(...station[clip]);
  let left=new THREE.Vector3(-1.03,1.68,-.36),right=new THREE.Vector3(-.48,1.82,-.61),lean=.06,twist=0,head=.14,yaw=0,toolAngle=new THREE.Euler(),lift=0;
  impact=0;planingCut=false;
  if(clip==='saw'){right.z+=cycle*.13;lean=.07+cycle*.015;head=.2;}
  if(clip==='plane'){
    const phase=(q/2.35)%1,push=phase<.64,u=push?phase/.64:(phase-.64)/.36,travel=smooth(u),slide=push?THREE.MathUtils.lerp(-.27,.27,travel):THREE.MathUtils.lerp(.27,-.27,travel),returnLift=push?0:Math.sin(u*Math.PI)*.025;
    planeCenter.set(-.65+slide,1.642+returnLift,-.42);planeTool.position.copy(planeCenter);
    left.copy(planeCenter).add(new THREE.Vector3(-.075,.105,0));right.copy(planeCenter).add(new THREE.Vector3(.095,.075,0));
    lean=.10+(push?Math.sin(u*Math.PI)*.025:0);twist=-slide*.07;head=.20;planingCut=push&&u>.08&&u<.96;
  }
  if(clip==='hammer'){const phase=(q/1.25)%1;lift=phase<.38?smooth(phase/.38):phase<.5?1:1-smooth((phase-.5)/.13);left.set(.4,1.91,-.34);right.set(.87,2.14+lift*.33,-.44-lift*.1);lean=.055+(1-lift)*.045;head=.14;toolAngle.z=lift*.17;impact=phase>.61&&phase<.69?1-(phase-.61)/.08:0;}
  if(clip==='sand'){left.set(.33,2.37,-.38);right.set(.72+Math.sin(q*5)*.13,2.44,-.32+Math.cos(q*5)*.025);lean=.06;twist=Math.sin(q*5)*.025;head=.15;}
  if(clip==='carve'){left.set(.31,2.37,-.37);right.set(.99+Math.sin(q*1.7)*.025,2.51+Math.sin(q*3.4)*.009,-.51+Math.cos(q*1.7)*.012);lean=.06;head=.12;toolAngle.set(-.65,0,-.8);}
  if(clip==='idle'){lean=0;head=Math.sin(q*.8)*.055;twist=Math.sin(q*.5)*.025;yaw=.22;}
  if(['hammer','sand','carve'].includes(clip)){const top=(recipeHeights[settings.recipeId]??.785)-.785;left.y+=top;right.y+=top;}
  const blend=design.motion?1-Math.exp(-dt*5):1;
  if(!design.motion&&route.length){maker.group.position.copy(pos);route=[];}
  const arriving=route.length>0;
  const greeting=clip==='idle'&&!arriving&&settings.motion==='full'?idleGreeting(q):{amount:0,sway:0};
  if(arriving){
    if(!design.motion){maker.group.position.copy(pos);route=[];}
    else{
      const next=route[0],delta=next.clone().sub(maker.group.position);delta.y=0;
      const distance=delta.length(),step=Math.min(distance,dt*1.85);
      if(distance>.001){yaw=Math.atan2(delta.x,delta.z);maker.group.position.addScaledVector(delta.normalize(),step);}
      if(distance<.04)route.shift();
    }
    lean=0;twist=0;head=.04;
  }else{maker.group.position.x=pos.x;maker.group.position.z=pos.z;}
  maker.group.rotation.y+=Math.atan2(Math.sin(yaw-maker.group.rotation.y),Math.cos(yaw-maker.group.rotation.y))*blend;
  walking=design.motion&&arriving;
  maker.legs.forEach((leg,i)=>{const s=Math.sin(gaitClock*8+i*Math.PI);leg.rotation.x=walking?s*.38:0;leg.userData.knee.rotation.x=walking?Math.max(0,-s)*.62:.025;leg.userData.ankle.rotation.x=-leg.rotation.x-leg.userData.knee.rotation.x;});
  maker.spine.position.y=2.65+(walking?0:Math.sin(q*1.8)*.012)*motion;
  maker.spine.rotation.x+=(lean-maker.spine.rotation.x)*blend;maker.spine.rotation.y+=(twist-maker.spine.rotation.y)*blend;
  maker.head.rotation.x+=(head-greeting.amount*.035-maker.head.rotation.x)*blend;maker.head.rotation.y+=((clip==='idle'?.18+Math.sin(q*.6)*.1+greeting.amount*.06:-.035)-maker.head.rotation.y)*blend;
  maker.group.position.y=.13;
  maker.group.updateMatrixWorld(true);
  const lowest=Math.min(...maker.legs.map(leg=>footBounds.setFromObject(leg.userData.sole).min.y));maker.group.position.y+=floorY-lowest;
  maker.group.updateMatrixWorld(true);
  const toolQ=new THREE.Quaternion().setFromEuler(toolAngle),flatQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI));
  let leftQ=flatQ.clone(),rightQ=flatQ.clone(),curl=.7;
  if(clip==='plane'){leftQ.setFromEuler(new THREE.Euler(0,-.90,Math.PI/2));rightQ.setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI+.55));curl=.85;}
  if(['hammer','carve','saw'].includes(clip))rightQ.copy(toolQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
  if(clip==='idle'||arriving){
    const swing=walking?Math.sin(gaitClock*8)*.12:0;
    left.copy(maker.body.localToWorld(new THREE.Vector3(-.94,2.38,.17+swing*2)));right.copy(maker.body.localToWorld(new THREE.Vector3(.94,2.38,.17-swing*2)));
    leftQ.setFromEuler(new THREE.Euler(0,Math.PI/2+maker.group.rotation.y,0));rightQ.setFromEuler(new THREE.Euler(0,-Math.PI/2+maker.group.rotation.y,0));curl=.15;
    curl=THREE.MathUtils.lerp(.15,.06,greeting.amount);
  }
  solveArm(maker.arms[0],left,leftQ,clip==='plane'?curl:arriving||clip==='idle'?.15:.12,dt);solveArm(maker.arms[1],right,rightQ,curl,dt,greeting);
  maker.arms[1].fingers.forEach(({knuckle},i)=>{knuckle.rotation.z=(i-1.5)*.025*greeting.amount;});
  maker.group.updateMatrixWorld(true);
  updateSoftSilhouette();
  const blinkPhase=(q+1.9)%5.8,blink=design.motion&&blinkPhase<.16?Math.max(.08,Math.abs(blinkPhase-.08)/.08):1;
  maker.eyes.forEach(({eye,pupil})=>{eye.scale.y=blink;pupil.position.x=clip==='idle'?Math.sin(q*.5)*.014:.008;pupil.position.y=clip==='idle'?-.005:-.022;});
  for(const [name,tool] of Object.entries(toolMap)){tool.visible=name===clip&&!arriving;if(tool.visible){tool.quaternion.copy(tool.parent.getWorldQuaternion(rotationScratch).invert()).multiply(toolQ);}}
  for(let i=0;i<plants.length;i++)plants[i].rotation.z=Math.sin(t*.8+i)*.025*motion;hand1.rotation.z=-t*.006*motion;
  for(let i=0;i<shavings.length;i++){const m=shavings[i],life=(q*1.3+i/24)%1,cut=['saw','carve'].includes(clip)||(clip==='plane'&&planingCut),dust=clip==='sand';m.visible=design.motion&&!arriving&&(cut||dust||impact>0);if(m.visible){const origin=clip==='saw'?new THREE.Vector3(-.48,1.64,-.28):clip==='plane'?planeCenter.clone().add(new THREE.Vector3(.07,.005,.03)):clip==='hammer'?new THREE.Vector3(.87,1.86,-.44):new THREE.Vector3(.67,2.33,-.37);m.position.copy(origin).add(new THREE.Vector3(life*(i%2?.30:-.18),Math.sin(life*Math.PI)*.13-life*.16,life*.22+(i%4)*.014));m.rotation.set(life*7+i,life*9,life*4);m.scale.setScalar((1-life)*(dust?.25:clip==='carve'?.35:.65));}}
}
let apprenticeClock=0,apprenticeClip='idle',apprenticeProgress=0,apprenticeRecipe='stool';
function animateApprentice(dt){
  const member=settings.crew.find(person=>person.staffId==='apprentice'&&person.status==='active');
  const visible=Boolean(member);
  extraBay.visible=visible||settings.joinery||settings.forge||settings.yard;apprenticeBench.visible=visible;joineryBench.visible=settings.joinery;
  apprentice.group.visible=visible;
  for(const tool of Object.values(apprenticeTools))tool.visible=false;
  for(const model of Object.values(apprenticeRecipes))model.group.visible=false;
  if(!visible)return;
  const clip=member.activity;
  if(member.recipeId!==apprenticeRecipe){apprenticeRecipe=member.recipeId;apprenticeProgress=member.progress;}
  if(clip!==apprenticeClip){apprenticeClip=clip;apprenticeClock=0;}
  if(design.motion)apprenticeClock+=dt;
  const q=apprenticeClock,offset=new THREE.Vector3(6,0,0),motion=design.motion?1:0;
  // Ada stays in her own station: no route crosses Nora or either work surface.
  apprentice.group.position.set(6+(clip==='idle'?-.5:station[clip][0]),.13,-1.03);
  apprentice.group.rotation.y=clip==='idle'?.12:0;
  apprentice.spine.position.y=2.65+Math.sin(q*1.8)*.012*motion;
  apprentice.spine.rotation.x=clip==='idle'?0:.06;
  apprentice.spine.rotation.y=clip==='sand'?Math.sin(q*5)*.025:0;
  apprentice.head.rotation.x=clip==='idle'?Math.sin(q*.8)*.055:.17;
  apprentice.head.rotation.y=clip==='idle'?.15:0;
  for(const leg of apprentice.legs){leg.rotation.x=0;leg.userData.knee.rotation.x=.025;leg.userData.ankle.rotation.x=-.025;}
  apprentice.group.updateMatrixWorld(true);
  const lowest=Math.min(...apprentice.legs.map(leg=>footBounds.setFromObject(leg.userData.sole).min.y));
  apprentice.group.position.y+=floorY-lowest;apprentice.group.updateMatrixWorld(true);
  let left=new THREE.Vector3(-1.03,1.68,-.36),right=new THREE.Vector3(-.48,1.82,-.61),toolAngle=new THREE.Euler(),curl=.7;
  const top=(recipeHeights[member.recipeId]??.785)-.785;
  if(clip==='saw')right.z+=Math.sin(q*4.6)*.13;
  if(clip==='plane'){
    const phase=(q/2.35)%1,push=phase<.64,u=push?phase/.64:(phase-.64)/.36,travel=smooth(u),slide=push?THREE.MathUtils.lerp(-.27,.27,travel):THREE.MathUtils.lerp(.27,-.27,travel);
    const center=new THREE.Vector3(-.65+slide,1.642+(push?0:Math.sin(u*Math.PI)*.025),-.42);
    apprenticeTools.plane.position.copy(center).add(offset);
    left.copy(center).add(new THREE.Vector3(-.075,.105,0));right.copy(center).add(new THREE.Vector3(.095,.075,0));curl=.85;
  }
  if(clip==='hammer'){
    const phase=(q/1.25)%1,lift=phase<.38?smooth(phase/.38):phase<.5?1:1-smooth((phase-.5)/.13);
    left.set(.4,1.91+top,-.34);right.set(.87,2.14+top+lift*.33,-.44-lift*.1);toolAngle.z=lift*.17;
  }
  if(clip==='sand'){left.set(.33,2.37+top,-.38);right.set(.72+Math.sin(q*5)*.13,2.44+top,-.32+Math.cos(q*5)*.025);}
  if(clip==='carve'){left.set(.31,2.37+top,-.37);right.set(.99+Math.sin(q*1.7)*.025,2.51+top+Math.sin(q*3.4)*.009,-.51+Math.cos(q*1.7)*.012);toolAngle.set(-.65,0,-.8);}
  left.add(offset);right.add(offset);
  const toolQ=new THREE.Quaternion().setFromEuler(toolAngle),leftQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI)),rightQ=leftQ.clone();
  if(clip==='plane'){leftQ.setFromEuler(new THREE.Euler(0,-.90,Math.PI/2));rightQ.setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI+.55));}
  if(['hammer','carve','saw'].includes(clip))rightQ.copy(toolQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
  if(clip==='idle'){
    left.copy(apprentice.body.localToWorld(new THREE.Vector3(-.94,2.38,.17)));right.copy(apprentice.body.localToWorld(new THREE.Vector3(.94,2.38,.17)));
    leftQ.setFromEuler(new THREE.Euler(0,Math.PI/2+.12,0));rightQ.setFromEuler(new THREE.Euler(0,-Math.PI/2+.12,0));curl=.15;
  }
  apprentice.poseArm(apprentice.arms[0],left,leftQ,clip==='plane'||clip==='idle'?curl:.12,dt,clip==='plane'?smooth(q/.4):0);
  apprentice.poseArm(apprentice.arms[1],right,rightQ,curl,dt,clip==='plane'?smooth(q/.4):0);
  apprentice.group.updateMatrixWorld(true);apprentice.updateMeshes();
  const blinkPhase=(q+3.1)%5.8,blink=design.motion&&blinkPhase<.16?Math.max(.08,Math.abs(blinkPhase-.08)/.08):1;
  apprentice.eyes.forEach(({eye,pupil})=>{eye.scale.y=blink;pupil.position.y=clip==='idle'?-.005:-.022;});
  for(const [name,tool] of Object.entries(apprenticeTools)){
    tool.visible=name===clip;
    if(tool.visible)tool.quaternion.copy(tool.parent.getWorldQuaternion(rotationScratch).invert()).multiply(toolQ);
  }
  apprenticeProgress+=(member.progress-apprenticeProgress)*(design.motion?1-Math.exp(-dt*4):1);
  updateRecipeModels(apprenticeRecipes,member.recipeId,apprenticeProgress,member.stageProgress,member.stageId,member.patternId,member.finishStyleId);
}

function animateYardWorker(worker,dt){
  const {rig:apprentice,tools:apprenticeTools,models:apprenticeRecipes}=worker;
  const member=settings.crew.find(person=>person.staffId===worker.id&&person.status==='active');
  const visible=Boolean(member);
  apprentice.group.visible=visible;
  for(const tool of Object.values(apprenticeTools))tool.visible=false;
  for(const model of Object.values(apprenticeRecipes))model.group.visible=false;
  if(!visible)return;
  const clip=member.activity;
  if(member.recipeId!==worker.recipe){worker.recipe=member.recipeId;worker.progress=member.progress;}
  if(clip!==worker.clip){worker.clip=clip;worker.clock=0;}
  if(design.motion)worker.clock+=dt;
  const q=worker.clock,offset=new THREE.Vector3(worker.x,0,worker.z),motion=design.motion?1:0;
  // Each yard craftsperson stays at their own station with the approved connected IK.
  apprentice.group.position.set(worker.x+(clip==='idle'?-.5:station[clip][0]),.13,worker.z-1.03);
  apprentice.group.rotation.y=clip==='idle'?.12:0;
  apprentice.spine.position.y=2.65+Math.sin(q*1.8)*.012*motion;
  apprentice.spine.rotation.x=clip==='idle'?0:.06;
  apprentice.spine.rotation.y=clip==='sand'?Math.sin(q*5)*.025:0;
  apprentice.head.rotation.x=clip==='idle'?Math.sin(q*.8)*.055:.17;
  apprentice.head.rotation.y=clip==='idle'?.15:0;
  for(const leg of apprentice.legs){leg.rotation.x=0;leg.userData.knee.rotation.x=.025;leg.userData.ankle.rotation.x=-.025;}
  apprentice.group.updateMatrixWorld(true);
  const lowest=Math.min(...apprentice.legs.map(leg=>footBounds.setFromObject(leg.userData.sole).min.y));
  apprentice.group.position.y+=floorY-lowest;apprentice.group.updateMatrixWorld(true);
  let left=new THREE.Vector3(-1.03,1.68,-.36),right=new THREE.Vector3(-.48,1.82,-.61),toolAngle=new THREE.Euler(),curl=.7;
  const top=(recipeHeights[member.recipeId]??.785)-.785;
  if(clip==='saw')right.z+=Math.sin(q*4.6)*.13;
  if(clip==='plane'){
    const phase=(q/2.35)%1,push=phase<.64,u=push?phase/.64:(phase-.64)/.36,travel=smooth(u),slide=push?THREE.MathUtils.lerp(-.27,.27,travel):THREE.MathUtils.lerp(.27,-.27,travel);
    const center=new THREE.Vector3(-.65+slide,1.642+(push?0:Math.sin(u*Math.PI)*.025),-.42);
    apprenticeTools.plane.position.copy(center).add(offset);
    left.copy(center).add(new THREE.Vector3(-.075,.105,0));right.copy(center).add(new THREE.Vector3(.095,.075,0));curl=.85;
  }
  if(clip==='hammer'){
    const phase=(q/1.25)%1,lift=phase<.38?smooth(phase/.38):phase<.5?1:1-smooth((phase-.5)/.13);
    left.set(.4,1.91+top,-.34);right.set(.87,2.14+top+lift*.33,-.44-lift*.1);toolAngle.z=lift*.17;
  }
  if(clip==='sand'){left.set(.33,2.37+top,-.38);right.set(.72+Math.sin(q*5)*.13,2.44+top,-.32+Math.cos(q*5)*.025);}
  if(clip==='carve'){left.set(.31,2.37+top,-.37);right.set(.99+Math.sin(q*1.7)*.025,2.51+top+Math.sin(q*3.4)*.009,-.51+Math.cos(q*1.7)*.012);toolAngle.set(-.65,0,-.8);}
  left.add(offset);right.add(offset);
  const toolQ=new THREE.Quaternion().setFromEuler(toolAngle),leftQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI)),rightQ=leftQ.clone();
  if(clip==='plane'){leftQ.setFromEuler(new THREE.Euler(0,-.90,Math.PI/2));rightQ.setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI+.55));}
  if(['hammer','carve','saw'].includes(clip))rightQ.copy(toolQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
  if(clip==='idle'){
    left.copy(apprentice.body.localToWorld(new THREE.Vector3(-.94,2.38,.17)));right.copy(apprentice.body.localToWorld(new THREE.Vector3(.94,2.38,.17)));
    leftQ.setFromEuler(new THREE.Euler(0,Math.PI/2+.12,0));rightQ.setFromEuler(new THREE.Euler(0,-Math.PI/2+.12,0));curl=.15;
  }
  apprentice.poseArm(apprentice.arms[0],left,leftQ,clip==='plane'||clip==='idle'?curl:.12,dt,clip==='plane'?smooth(q/.4):0);
  apprentice.poseArm(apprentice.arms[1],right,rightQ,curl,dt,clip==='plane'?smooth(q/.4):0);
  apprentice.group.updateMatrixWorld(true);apprentice.updateMeshes();
  const blinkPhase=(q+3.1)%5.8,blink=design.motion&&blinkPhase<.16?Math.max(.08,Math.abs(blinkPhase-.08)/.08):1;
  apprentice.eyes.forEach(({eye,pupil})=>{eye.scale.y=blink;pupil.position.y=clip==='idle'?-.005:-.022;});
  for(const [name,tool] of Object.entries(apprenticeTools)){
    tool.visible=name===clip;
    if(tool.visible)tool.quaternion.copy(tool.parent.getWorldQuaternion(rotationScratch).invert()).multiply(toolQ);
  }
  worker.progress+=(member.progress-worker.progress)*(design.motion?1-Math.exp(-dt*4):1);
  updateRecipeModels(apprenticeRecipes,member.recipeId,worker.progress,member.stageProgress,member.stageId,member.patternId,member.finishStyleId);
}

let smithClock=0,smithClip='idle',smithProgress=0,smithRecipe='stool';
function animateBlacksmith(dt){
  forgeBay.visible=settings.forge;
  const member=settings.crew.find(person=>person.staffId==='blacksmith'&&person.status==='active');
  const visible=settings.forge&&Boolean(member);
  blacksmith.group.visible=visible;
  for(const tool of Object.values(smithTools))tool.visible=false;
  for(const model of Object.values(smithRecipes))model.group.visible=false;
  if(!visible)return;
  const clip=member.activity,heating=clip==='heat',working=clip!=='idle';
  if(clip!==smithClip){smithClip=clip;smithClock=0;}
  if(member.recipeId!==smithRecipe){smithRecipe=member.recipeId;smithProgress=member.progress;}
  if(design.motion)smithClock+=dt;
  const q=smithClock,phase=(q/1.8)%1;
  // A deliberate lift, pause and controlled strike; the head rests on the anvil
  // at its lowest point. Tongs remain in the other hand throughout the work clip.
  const lift=working&&clip==='hammer'?(phase<.40?smooth(phase/.40):phase<.55?1:1-smooth((phase-.55)/.23)):0;
  blacksmith.group.position.set(heating?7.48:6.0,.13,heating?5.16:3.95);
  blacksmith.group.rotation.y=heating?Math.PI:clip==='idle'?.12:0;
  blacksmith.spine.position.y=2.65;
  blacksmith.spine.rotation.x=working?.055:0;blacksmith.spine.rotation.y=0;
  blacksmith.head.rotation.x=working?.18:.01;blacksmith.head.rotation.y=clip==='idle'?.13:0;
  for(const leg of blacksmith.legs){leg.rotation.x=0;leg.userData.knee.rotation.x=.025;leg.userData.ankle.rotation.x=-.025;}
  blacksmith.group.updateMatrixWorld(true);
  const lowest=Math.min(...blacksmith.legs.map(leg=>footBounds.setFromObject(leg.userData.sole).min.y));
  blacksmith.group.position.y+=floorY-lowest;blacksmith.group.updateMatrixWorld(true);
  let left=new THREE.Vector3(5.82,1.51,4.21),right=new THREE.Vector3(6.10,1.715+lift*.33,4.55-lift*.045);
  const leftQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,Math.PI)),rightQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,-Math.PI/2));
  const hammerQ=new THREE.Quaternion(),tongsQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
  if(heating){
    left.set(7.47,1.40,4.64);right.set(7.83,1.43,4.76);
    leftQ.setFromEuler(new THREE.Euler(Math.PI/2,Math.PI,Math.PI));rightQ.copy(leftQ);
    tongsQ.setFromEuler(new THREE.Euler(Math.PI/2,0,0));
  }else if(clip==='tongs'||clip==='sand'){
    const slide=design.motion?Math.sin(q*1.8)*.045:0;
    left.x+=slide;right.set(6.20,1.59,4.32);rightQ.copy(leftQ);
  }
  if(!working){
    left.copy(blacksmith.body.localToWorld(new THREE.Vector3(-.94,2.38,.17)));
    right.copy(blacksmith.body.localToWorld(new THREE.Vector3(.94,2.38,.17)));
    leftQ.setFromEuler(new THREE.Euler(0,Math.PI/2+.12,0));rightQ.setFromEuler(new THREE.Euler(0,-Math.PI/2+.12,0));
  }
  blacksmith.poseArm(blacksmith.arms[0],left,leftQ,working?.8:.15,dt,working?1:0);
  blacksmith.poseArm(blacksmith.arms[1],right,rightQ,working?.8:.15,dt,working?1:0);
  blacksmith.group.updateMatrixWorld(true);blacksmith.updateMeshes();
  smithHammer.visible=clip==='hammer';smithTongs.visible=working;
  if(smithHammer.visible)smithHammer.quaternion.copy(smithHammer.parent.getWorldQuaternion(rotationScratch).invert()).multiply(hammerQ);
  if(smithTongs.visible)smithTongs.quaternion.copy(smithTongs.parent.getWorldQuaternion(rotationScratch).invert()).multiply(tongsQ);
  hotStock.visible=working;
  const blinkPhase=(q+4.2)%5.8,blink=design.motion&&blinkPhase<.16?Math.max(.08,Math.abs(blinkPhase-.08)/.08):1;
  blacksmith.eyes.forEach(({eye,pupil})=>{eye.scale.y=blink;pupil.position.y=working?-.022:-.005;});
  smithProgress+=(member.progress-smithProgress)*(design.motion?1-Math.exp(-dt*4):1);
  updateRecipeModels(smithRecipes,member.recipeId,smithProgress,member.stageProgress,member.stageId,member.patternId,member.finishStyleId);
  // A selected target remains on its worktop while paused, reviewed or ready.
  // With no explicit target, null recipeId keeps the off-duty worktop clear.
}

function animateCraft(dt){
  const wanted=settings.progress;
  drawProgress+=(wanted-drawProgress)*(design.motion?1-Math.exp(-dt*4):1);
  for(const partMesh of parts){
    const d=partMesh.userData,k=smooth((drawProgress-d.threshold)/.14);
    partMesh.position.lerpVectors(d.start,d.assembled,k);
    if(k>0&&k<1)partMesh.position.y+=Math.sin(k*Math.PI)*.35;
    partMesh.rotation.set(THREE.MathUtils.lerp(d.startRotation.x,d.rotation.x,k),THREE.MathUtils.lerp(d.startRotation.y,d.rotation.y,k),THREE.MathUtils.lerp(d.startRotation.z,d.rotation.z,k));
  }
  carvedLeaf.visible=settings.activity==='carve';
  carvedLeaf.scale.setScalar(.85);
  
  craft.visible=settings.recipeId==='stool';craft.position.copy(stoolHome);craft.scale.setScalar(1);craft.rotation.y=0;
  updateRecipeModels(recipeModels,settings.recipeId,drawProgress,settings.stageProgress,settings.mainStageId,settings.patternId,settings.finishStyleId);
  applyObjectStyle(craft,settings.patternId,settings.finishStyleId);
}

function cancelScheduled(){
  if(raf)cancelAnimationFrame(raf);
  if(timer)clearTimeout(timer);
  raf=0;timer=0;
}
function unavailable(error){
  if(disposed||failed)return;
  failed=true;dispose();onUnavailable?.(error);
}
function draw(dt){
  animateMaker(elapsedScene,settings.activity!=='idle',dt);
  animateCraft(dt);animateApprentice(dt);animateBlacksmith(dt);animateYard(dt);cameraUpdate(dt);renderer.render(scene,camera);
}
function schedule(){
  if(disposed||failed||document.hidden||settings.motion==='still'||raf||timer)return;
  if(settings.motion==='reduced'){
    timer=setTimeout(()=>{timer=0;if(!document.hidden&&!disposed)raf=requestAnimationFrame(frame);},1000/12);
  }else raf=requestAnimationFrame(frame);
}
function frame(now){
  raf=0;
  if(disposed||failed||document.hidden)return;
  const dt=Math.max(0,Math.min((now-last)/1000,.15));last=now;
  elapsedScene+=dt;
  try{draw(dt);}catch(error){unavailable(error);return;}
  schedule();
}
function invalidate(){
  if(disposed||failed||document.hidden)return;
  if(settings.motion==='still'){
    // Still mode renders once per explicit scene, size, or camera change.
    // Snap interpolation without advancing an animation clock.
    try{draw(1);}catch(error){unavailable(error);}
  }else if(!raf&&!timer){last=performance.now();raf=requestAnimationFrame(frame);}
}
function visibility(){
  cancelScheduled();
  if(!document.hidden){last=performance.now();invalidate();}
}
function contextLost(event){event.preventDefault();unavailable(new Error('webgl-context-lost'));}
function update(next){
  if(disposed||failed)return;
  const previous=settings;settings=normalize({...settings,...next});design.motion=settings.motion!=='still';
  if(previous.motion!==settings.motion){cancelScheduled();last=performance.now();}
  if(previous.recipeId!==settings.recipeId)drawProgress=settings.progress;
  const enlarged=settings.yard||settings.joinery||settings.forge||settings.crew.some(member=>member.status==='active');
  if(previous.expanded!==settings.expanded||(!enlarged&&previous.activity!==settings.activity)||previous.joinery!==settings.joinery||previous.forge!==settings.forge||previous.yard!==settings.yard||previous.crew.some(member=>member.status==='active')!==settings.crew.some(member=>member.status==='active'))view();
  invalidate();
}
function dispose(){
  if(disposed)return;disposed=true;cancelScheduled();observer?.disconnect();
  window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);
  canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);
  canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerUp);
  canvas.removeEventListener('lostpointercapture',pointerUp);canvas.removeEventListener('wheel',wheel);
  canvas.removeEventListener('webglcontextlost',contextLost);
  const geometrySet=new Set(Object.values(geometries)),materialSet=new Set([...Object.values(materials),...styleMaterials]),textures=new Set();
  scene.traverse(object=>{
    if(object.geometry)geometrySet.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materialSet.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
    object.shadow?.dispose();
  });
  geometrySet.forEach(item=>item.dispose());materialSet.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());
  scene.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();
}
const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
observer?.observe(container);window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',visibility);
canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
canvas.addEventListener('lostpointercapture',pointerUp);canvas.addEventListener('wheel',wheel,{passive:false});
canvas.addEventListener('webglcontextlost',contextLost);
// Begin at the requested station, so the first still frame has a finished pose.
maker.group.position.set(...station[settings.activity]);
view();angle=targetAngle;zoom=goalZoom;look.copy(goalLook);
resize();
return {update,dispose};
}
