import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';
const report=JSON.parse(fs.readFileSync('art/buildings/civic/model-report.json','utf8'));
const results=[];
for (const row of report) {
  const data=fs.readFileSync(row.file);
  const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  assert.equal(doc.asset.version,'2.0');
  assert.equal(doc.extensionsRequired?.length??0,0);
  assert.equal(doc.extensionsUsed?.length??0,0);
  assert.equal(doc.cameras?.length??0,0);
  assert.equal(doc.images?.length??0,0);
  assert.equal(doc.materials.length,8);
  assert(!doc.buffers.some(b=>b.uri));
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  let triangles=0,meshes=0;
  gltf.scene.traverse(o=>{
    assert(!o.isCamera&&!o.isLight);
    if(!o.isMesh)return;
    meshes++;
    const g=o.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal');
    const count=g.index?.count??p.count;
    triangles+=count/3;
    const edges=new Map();
    const point=i=>new Vector3().fromBufferAttribute(p,i);
    for(let j=0;j<count;j+=3){
      const ids=[0,1,2].map(k=>g.index?g.index.getX(j+k):j+k);
      const [a,b,c]=ids.map(point);
      const geometric=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a));
      assert(geometric.length()>1e-9,`degenerate ${row.file}`);
      assert(geometric.normalize().dot(new Vector3().fromBufferAttribute(n,ids[0]))>.999,`normal ${row.file}`);
      const keys=[a,b,c].map(v=>v.toArray().map(x=>x.toFixed(5)).join(','));
      for(let k=0;k<3;k++){
        const key=[keys[k],keys[(k+1)%3]].sort().join('|');
        edges.set(key,(edges.get(key)??0)+1);
      }
    }
    // Coincident touching solids can produce 4 or 6 uses, but no open boundaries.
    assert([...edges.values()].every(n=>n%2===0),`open geometry ${row.file}`);
  });
  assert.equal(triangles,row.triangles);
  const bounds=new Box3().setFromObject(gltf.scene);
  assert(Math.abs(bounds.min.y)<1e-5);
  assert(triangles>=2000 && triangles<= (row.file.includes('l05')?12000:8000));
  results.push({file:row.file,loaded:true,triangles,meshes,bounds: [bounds.min.toArray(),bounds.max.toArray()],closed:true});
  console.log('PASS',row.file,triangles);
}
fs.writeFileSync('art/buildings/civic/validation.json',JSON.stringify(results,null,2));
