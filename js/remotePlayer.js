/* ============================================================
   remotePlayer.js — render & interpolate remote player
   ============================================================ */
(function(){
  'use strict';
  const RemotePlayer = {
    mesh: null,
    group: null,
    nameSprite: null,
    targetPos: new THREE.Vector3(0,1.7,0),
    prevPos: new THREE.Vector3(0,1.7,0),
    targetYaw: 0,
    prevYaw: 0,
    lerpT: 1,
    state: 'idle',
    visible: false,
    id: null,
    name: '',

    init(scene){
      this.scene=scene;
      this.group=new THREE.Group();
      this.group.visible=false;
      scene.add(this.group);

      // body: capsule-ish using cylinder + spheres
      const bodyMat=new THREE.MeshStandardMaterial({color:0x2b6fd6, roughness:0.6, metalness:0.2});
      const headMat=new THREE.MeshStandardMaterial({color:0xe8b48c, roughness:0.8});
      const legMat=new THREE.MeshStandardMaterial({color:0x1b1f2a, roughness:0.9});

      // torso
      const torso=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.75,0.32), bodyMat);
      torso.position.set(0,1.15,0);
      this.group.add(torso);
      // head
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.22,12,10), headMat);
      head.position.set(0,1.68,0);
      this.group.add(head);
      // cap
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.25,0.12,12), bodyMat);
      cap.position.set(0,1.84,0);
      this.group.add(cap);
      // legs
      const l1=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.7,0.22), legMat);
      l1.position.set(-0.14,0.45,0);
      this.group.add(l1);
      const l2=l1.clone(); l2.position.set(0.14,0.45,0);
      this.group.add(l2);
      // arms
      const a1=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.6,0.15), bodyMat);
      a1.position.set(-0.36,1.1,0);
      this.group.add(a1);
      const a2=a1.clone(); a2.position.set(0.36,1.1,0);
      this.group.add(a2);

      // direction arrow
      const dir=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.3,8), new THREE.MeshStandardMaterial({color:0xffc63a, emissive:0xffc63a, emissiveIntensity:0.8}));
      dir.position.set(0,1.2,0.35);
      dir.rotation.x=Math.PI/2;
      this.group.add(dir);
      this.dirMesh=dir;

      // name sprite
      this.nameSprite=this.makeNameSprite('PLAYER');
      this.nameSprite.position.set(0,2.35,0);
      this.group.add(this.nameSprite);

      this.torso=torso;
      this.head=head;
      this.legs=[l1,l2];
      this.arms=[a1,a2];
      this.animPhase=0;
    },

    makeNameSprite(text){
      const canvas=document.createElement('canvas');
      canvas.width=512; canvas.height=128;
      const g=canvas.getContext('2d');
      g.fillStyle='rgba(0,0,0,0.65)';
      // rounded rect
      const r=14;
      const x=10,y=10,w=canvas.width-20,h=canvas.height-30;
      g.beginPath();
      g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
      g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
      g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y);
      g.closePath(); g.fill();
      g.strokeStyle='#00e5ff'; g.lineWidth=3; g.stroke();
      g.fillStyle='#fff';
      g.font='bold 44px Rajdhani, Arial';
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText(text, canvas.width/2, canvas.height/2 -2);
      const tex=new THREE.CanvasTexture(canvas);
      tex.needsUpdate=true;
      const mat=new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false});
      const sprite=new THREE.Sprite(mat);
      sprite.scale.set(2.2,0.55,1);
      sprite.renderOrder=999;
      sprite.material.depthTest=false;
      return sprite;
    },
    setName(name){
      this.name=name||'PLAYER';
      if(this.nameSprite){
        // recreate texture
        const canvas=document.createElement('canvas');
        canvas.width=512; canvas.height=128;
        const g=canvas.getContext('2d');
        g.fillStyle='rgba(0,0,0,0.65)';
        const r=14, x=10,y=10,w=canvas.width-20,h=canvas.height-30;
        g.beginPath(); g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
        g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
        g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y); g.closePath(); g.fill();
        g.strokeStyle='#00e5ff'; g.lineWidth=3; g.stroke();
        g.fillStyle='#fff'; g.font='bold 44px Rajdhani, Arial'; g.textAlign='center'; g.textBaseline='middle';
        g.fillText(this.name, canvas.width/2, canvas.height/2 -2);
        const tex=new THREE.CanvasTexture(canvas);
        this.nameSprite.material.map.dispose();
        this.nameSprite.material.map=tex;
        this.nameSprite.material.needsUpdate=true;
      }
    },

    show(id, name, pos){
      this.id=id;
      this.setName(name);
      this.visible=true;
      this.group.visible=true;
      if(pos){
        const yGround=(pos.y||1.7)-1.7;
        this.group.position.set(pos.x,yGround,pos.z);
        this.targetPos.set(pos.x,yGround,pos.z);
        this.prevPos.copy(this.targetPos);
      }
    },
    hide(){
      this.visible=false;
      this.group.visible=false;
      this.id=null;
    },

    // called on network move
    onMove(data){
      if(!this.visible) return;
      if(data.id!==this.id) return;
      this.prevPos.copy(this.group.position);
      const yGround = (data.pos.y||1.7) - 1.7;
      this.targetPos.set(data.pos.x, yGround, data.pos.z);
      this.prevYaw=this.group.rotation.y;
      let diff=data.yaw - this.prevYaw;
      while(diff>Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;
      this.targetYaw=this.prevYaw+diff;
      this.state=data.state||'idle';
      this.targetPitch=data.pitch||0;
      this.lerpT=0;
    },

    update(dt){
      if(!this.visible) return;
      this.lerpT=Math.min(1, this.lerpT + dt*10);
      const k= this.lerpT<1 ? (1-Math.pow(1-this.lerpT,3)) : 1;
      const baseX = this.prevPos.x + (this.targetPos.x - this.prevPos.x)*k;
      const baseZ = this.prevPos.z + (this.targetPos.z - this.prevPos.z)*k;
      const baseY = this.prevPos.y + (this.targetPos.y - this.prevPos.y)*k;
      // yaw lerp
      const yawDiff=this.targetYaw - this.prevYaw;
      this.group.rotation.y = this.prevYaw + yawDiff * k;
      this.group.position.x = baseX;
      this.group.position.z = baseZ;
      // anim bob + jump
      this.animPhase += dt * (this.state==='run'?13 : this.state==='walk'?9 : this.state==='jump'?14 : 1.5);
      const moving=this.state==='walk'||this.state==='run';
      const jumping=this.state==='jump';
      let bob=0;
      if(moving){
        bob=Math.sin(this.animPhase)*0.05;
        this.legs[0].position.y=0.45 + Math.sin(this.animPhase)*0.08;
        this.legs[1].position.y=0.45 - Math.sin(this.animPhase)*0.08;
        this.arms[0].rotation.x=Math.sin(this.animPhase)*0.4;
        this.arms[1].rotation.x=-Math.sin(this.animPhase)*0.4;
      } else if(jumping){
        bob=Math.sin(this.animPhase)*0.12;
        this.legs[0].position.y=0.45; this.legs[1].position.y=0.45;
        this.arms[0].rotation.x=-0.6; this.arms[1].rotation.x=-0.6;
      } else {
        this.legs[0].position.y=0.45; this.legs[1].position.y=0.45;
        this.arms[0].rotation.x=0; this.arms[1].rotation.x=0;
      }
      this.group.position.y = baseY + bob;
    },

    getPos(){ return this.group.position.clone(); }
  };

  window.RemotePlayer = RemotePlayer;
})();
