import { describe, expect, it } from 'vitest';
import { localizeWorkspace } from '../native-workspaces/localize.js';
describe('native workspace Chinese UI',()=>{
 it('translates UI, shortcuts and dynamic page counts without changing document text or input values',()=>{
  const host=document.createElement('section');
  host.innerHTML='<button title="Undo (Ctrl/Cmd Z)">Export a PDF</button><span>Page 2 of 8</span><div class="textLayer"><span>Save</span></div><div data-user-content>Open</div><input value="Title" placeholder="Search boards"><select><option>Fit width</option></select>';
  document.body.append(host);
  const stop=localizeWorkspace(host,'zh');
  expect(host.querySelector('button')?.textContent).toBe('导出 PDF');
  expect(host.querySelector('button')?.title).toBe('撤销 (Ctrl/Cmd Z)');
  expect(host.querySelector('span')?.textContent).toBe('第 2 页，共 8 页');
  expect(host.querySelector('.textLayer')?.textContent).toBe('Save');
  expect(host.querySelector('[data-user-content]')?.textContent).toBe('Open');
  expect(host.querySelector('input')?.value).toBe('Title');
  expect(host.querySelector('input')?.placeholder).toBe('搜索白板');
  expect(host.querySelector('option')?.textContent).toBe('适应宽度');
  expect(host.querySelector('option')?.value).toBe('Fit width');
  stop();
  const stopEnglish=localizeWorkspace(host,'en');
  expect(host.querySelector('button')?.textContent).toBe('Export a PDF');
  expect(host.querySelector('button')?.title).toBe('Undo (Ctrl/Cmd Z)');
  stopEnglish();host.remove();
 });
 it('translates newly opened dialogs and stops observing when detached',async()=>{
  const host=document.createElement('section');document.body.append(host);
  const stop=localizeWorkspace(host,'zh');
  host.innerHTML='<dialog><button>Cancel</button><h2>Protect a PDF</h2></dialog>';
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  expect(host.querySelector('button')?.textContent).toBe('取消');
  expect(host.querySelector('h2')?.textContent).toBe('保护 PDF');
  stop();host.innerHTML='<button>Save</button>';
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  expect(host.querySelector('button')?.textContent).toBe('Save');host.remove();
 });
});
