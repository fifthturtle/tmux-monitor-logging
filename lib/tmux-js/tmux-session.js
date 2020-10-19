const tmux = require('./tmux');
const Window = require('./tmux-window');
const io = require('./tmux-manager');

class Session {
    constructor(id, name)
    {
        this.id = id;
        this.name = name;
        this.windows = {};
        this.setStatusColor("blue").then(res => {
            io.socket().emit('tmux-init', { components: [this.id], name: this.name });
            this.initWindows();
        });
    }

    setStatusColor(color) {
        tmux.setStatusColor(color, this.id);
        return Promise.resolve(true);
    }

    initWindows()
    {
        tmux.getWindows(this.id).then(res => {
            res.forEach(window => {
                this.addWindow(window);
            })
        })
    }

    addWindow(window) {
        if (this.windows[window.id]) return;
        this.windows[window.id] = new Window(window.id, window.name, window.index, this.id)
    }

    update(key, value) {
        this[key] = value;
        io.socket().emit('tmux-update', { components: [this.id], key, value });
    }

    destroy()
    {
        io.socket().emit('tmux-destroy', { components: [this.id] });
        return Promise.resolve(0);
    }
}

module.exports = Session;