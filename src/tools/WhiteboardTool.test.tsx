import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const scope=vi.hoisted(()=>({host:document.createElement('section'),started:null as Promise<void>|null}));
vi.mock('../native-workspaces/runtime.js',()=>({getScope:()=>scope,loadCloudSdk:()=>Promise.resolve()}));
vi.mock('../native-workspaces/whiteboard/main.js',()=>({mountWorkspace:async()=>{scope.host.innerHTML='<button>模板库</button>';}}));
import { I18nProvider } from '@/i18n/I18nProvider';
import WhiteboardTool from './WhiteboardTool';
describe('native workspace routing',()=>{
 it('mounts native DOM and preserves document state when returning',async()=>{
  const first=render(<MemoryRouter><I18nProvider><WhiteboardTool/></I18nProvider></MemoryRouter>);
  expect(await screen.findByRole('button',{name:'模板库'})).toBeInTheDocument();
  expect(document.querySelector('iframe')).toBeNull();
  const input=document.createElement('input');input.value='未保存的思维导图';scope.host.append(input);
  first.unmount();expect(scope.host.isConnected).toBe(false);
  const second=render(<MemoryRouter><I18nProvider><WhiteboardTool/></I18nProvider></MemoryRouter>);
  expect(scope.host.querySelector('input')?.value).toBe('未保存的思维导图');
  fireEvent.click(await screen.findByRole('link',{name:/返回工具箱|Back to tools/}));second.unmount();
 });
});
