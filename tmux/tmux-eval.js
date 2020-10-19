// test module to run tmux commands from the command line

const tmux = require('../lib/tmux-js/tmux');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

function q()
{
    rl.question('TMUX Command: ', (answer) => {
        if (answer !== '.exit')
        {
            let cmd = answer.split(' ');
            tmux._eval(cmd.shift(), (cmd.length) ? cmd : false).then(res => {
                console.log(res);
                q();
            }).catch(err => {
                console.log("ERROR");
                q();
            })
        } else {
            process.kill(0);
        }
    });
}

q();