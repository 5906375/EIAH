import { createContextAudio, stopContextAudio } from './context-audio.mjs';
// Illustrative presentation roles only. Does not select or execute real agents.
const roles={welcome:{name:'Recepção',label:'Entender o que você precisa',color:'#08739a',soft:'#edf8fd',position:'0%'},property:{name:'Imóvel',label:'Organizar informações e materiais',color:'#087b64',soft:'#edf8f2',position:'50%'},review:{name:'Revisão',label:'Conferir antes de continuar',color:'#7044ad',soft:'#f5f0fb',position:'100%'}};
let guide, audioControls, narration='', lastContext='';
export function updateGuide(role='welcome',message='Escolha seu objetivo. Vamos preparar o próximo passo.',stage='Início'){
 const r=roles[role]||roles.welcome;const key=role+'|'+stage+'|'+message;const contextChanged=key!==lastContext;if(contextChanged){stopContextAudio();lastContext=key;}narration='Olá, sou o Assistente de '+r.name+'. '+message;
 if(!guide){const target=document.querySelector('#authorizationForm,#requestForm,#setup,.conversation');if(!target)return;guide=document.createElement('section');guide.className='step-guide';guide.setAttribute('aria-label','Assistente desta etapa');const avatar=document.createElement('div');avatar.className='step-avatar';avatar.setAttribute('role','img');const copy=document.createElement('div');copy.className='step-guide-copy';for(const [tag,cls] of [['small','guide-stage'],['strong','guide-name'],['p','guide-message']]){const el=document.createElement(tag);el.className=cls;copy.append(el);}audioControls=createContextAudio(()=>narration);copy.append(audioControls.element);guide.append(avatar,copy);target.prepend(guide);}
 if(contextChanged)audioControls.setRole(role);
 document.documentElement.style.setProperty('--step-accent',r.color);document.documentElement.style.setProperty('--step-soft',r.soft);document.body.dataset.guideRole=role;
 guide.querySelector('.step-avatar').style.backgroundPosition=r.position+' center';guide.querySelector('.step-avatar').setAttribute('aria-label','Personagem ilustrativo de '+r.name);
 guide.querySelector('.guide-stage').textContent=stage;guide.querySelector('.guide-name').textContent='Assistente de '+r.name;guide.querySelector('.guide-message').textContent=message;
 const chatAvatar=document.querySelector('.conversation-top .avatar');if(chatAvatar){chatAvatar.classList.add('portrait-avatar');chatAvatar.textContent='';chatAvatar.style.backgroundPosition=r.position+' center';chatAvatar.setAttribute('role','img');chatAvatar.setAttribute('aria-label','Personagem ilustrativo de '+r.name);}
}
