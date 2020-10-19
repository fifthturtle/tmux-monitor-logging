// Creates a Window class. As each tmux session can contain multiple windows, the class structure is used
// Each Window contaiuns an object/array (map) of the panes contained in each session
// Each window object also controls the layout of its panes 

"use strict"

const tmux = require('./tmux');
const Pane = require('./tmux-pane');
const io = require('./tmux-manager');

class Window {
    constructor(id, name, index, session) {
        this.id = id;
        this.name = name;
        this.index = index;
        this.panes = {};
        this.session = session;
        tmux.windowLayout(this.id)
            .then(res => {
                this.layout = res;
                io.socket().emit('tmux-init', {
                    components: [this.session, this.id],
                    name: this.name,
                    index: this.index,
                    layout: this.layout
                });
                this.initPanes();
            });
    }

    initPanes() {
        this.layout.panes.forEach(pane => {
            this.addPane(pane);
        })
    }

    addPane(pane) {
        if (this.panes[pane.id]) return;
        this.panes[pane.id] = new Pane(pane.id, this.id, this.session);
    }

    update(key, value) {
        this[key] = value;
        io.socket().emit('tmux-update', { components: [this.session, this.id], key, value });
    }

    destroy()
    {
        io.socket().emit('tmux-destroy', { components: [this.session, this.id] });
        return Promise.resolve(0);
    }
}

module.exports = Window;