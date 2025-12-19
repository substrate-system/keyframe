import { type FunctionComponent, render } from 'preact'
import { html } from 'htm/preact'

if (import.meta.env.DEV || import.meta.env.MODE === 'staging') {
    localStorage.setItem('DEBUG', 'keyframe,keyframe:*')
} else {
    localStorage.removeItem('DEBUG')
    localStorage.removeItem('debug')
}

const Example:FunctionComponent<unknown> = function () {
    return html`<div>hello</div>`
}

render(html`<${Example} />`, document.getElementById('root')!)
