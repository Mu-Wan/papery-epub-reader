import {recognizeTxtChapters} from '../../public/vendor/txt-chapter-rules.mjs';
self.onmessage=event=>{try{self.postMessage({chapters:recognizeTxtChapters(event.data.text,event.data.rule)})}catch(error){self.postMessage({error:error.message||'规则无法使用'})}};
