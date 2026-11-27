import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {OskController} from './oskController.js';

export default class ErhaiKeyboard extends Extension {
    enable() {
        this._controller = new OskController(this.dir);
    }
    disable() {
        this._controller?.destroy();
        this._controller = null;
    }
}
