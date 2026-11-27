import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const NAME = 'org.erhai.InputFocus1';
const PATH = '/org/erhai/InputFocus';

export class InputFocusClient {
    constructor(context, changed) {
        this._context = context;
        this._changed = changed;
        this._owner = null;
        this._sequence = -1;
        this._epoch = null;
        this._requests = new Set();
        this._watch = Gio.bus_watch_name(Gio.BusType.SESSION, NAME, Gio.BusNameWatcherFlags.AUTO_START,
            (connection, _name, owner) => {
                this._connection = connection;
                this._owner = owner;
                this._sequence = -1;
                this._epoch = null;
                this._signal = connection.signal_subscribe(owner, NAME, 'Changed', PATH, null,
                    Gio.DBusSignalFlags.NONE, (_c, _sender, _path, _iface, _signal, parameters) => {
                        this._accept(JSON.parse(parameters.deepUnpack()[0]));
                    });
                this.refresh();
            }, () => {
                this._disconnect();
                this._changed(null);
            });
    }

    _accept(state, generation = this._context().generation, point = null) {
        if (generation !== this._context().generation || !this._owner)
            return;
        if (this._epoch !== null && state.epoch !== this._epoch)
            throw new Error('焦点服务在同一总线连接内更换了身份');
        if (state.sequence < this._sequence)
            return;
        this._epoch = state.epoch;
        this._sequence = state.sequence;
        this._changed({...state, generation}, point);
    }

    refresh(point = null) {
        if (!this._owner)
            return;
        const context = this._context();
        const owner = this._owner;
        const cancellable = new Gio.Cancellable();
        this._requests.add(cancellable);
        this._connection.call(owner, PATH, NAME, point && context.targets ? 'GetTargets' : 'GetFocus',
            new GLib.Variant('(uu)', [context.generation, context.pid]),
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, 2000, cancellable,
            (connection, result) => {
                this._requests.delete(cancellable);
                if (cancellable.is_cancelled())
                    return;
                const state = JSON.parse(connection.call_finish(result).deepUnpack()[0]);
                if (owner === this._owner)
                    this._accept(state, context.generation, point);
            });
    }

    _disconnect() {
        for (const request of this._requests)
            request.cancel();
        this._requests.clear();
        if (this._signal)
            this._connection.signal_unsubscribe(this._signal);
        this._signal = 0;
        this._owner = null;
        this._epoch = null;
        this._sequence = -1;
    }

    destroy() {
        Gio.bus_unwatch_name(this._watch);
        this._disconnect();
    }
}
