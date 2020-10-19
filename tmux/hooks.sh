#!/bin/bash

VAR=''
SESSION_ID=$(tmux display -p "#{session_id}")
EXTRAS="0"

for ARGUMENT in "$@"
do

    KEY=$(echo $ARGUMENT | cut -f1 -d=)
    VALUE=$(echo $ARGUMENT | cut -f2 -d=)   

    case "$KEY" in
            HOOK)              VAR="${VAR}\"hook\":\"${VALUE}\", " ;;
            SESSION_NAME)      VAR="${VAR}\"session_name\":\"${VALUE}\", " ;;
            WINDOW_ID)         VAR="${VAR}\"window_id\":\"${VALUE}\", " ;;
            WINDOW_NAME)       VAR="${VAR}\"window_name\":\"${VALUE}\", " ;;
            WINDOW_INDEX)      VAR="${VAR}\"window_index\":\"${VALUE}\", " ;;
            LAYOUT)            VAR="${VAR}\"layout\":\"${VALUE}\", " ;;
            GET_EXTRAS)        EXTRAS="${VALUE}";;
            SESSION_ID)        SESSION_ID=$(tmux display -p -t "${VALUE}" "#{session_id}");;
            *)   
    esac    
done

#

if [ "$EXTRAS" != "0" ]; then
    EXTRA_KEY=panes
    if [ "$EXTRAS" = "1" ]; then
        EXTRA=$(tmux list-panes -F "{'pane':'#{pane_id}','history':#{history_size},'visible':#{cursor_y},'command':'#{pane_current_command}'}")
    fi

    if [ "$EXTRAS" = "2" ]; then
        EXTRA=$(tmux list-panes -F "'#{pane_id}'")
    fi

    if [ "$EXTRAS" = "3" ]; then
        EXTRA_KEY=sessions
        EXTRA=$(tmux list-sessions -F "'#{session_id}'")
    fi

    result=$(echo ${EXTRA} | sed 's/ /,/g')
    result=$(echo "[${result}]")
    EXTRA=$(echo $result | sed "s/'/\"/g")
    VAR="${VAR}\"${EXTRA_KEY}\":${EXTRA}, "
fi

PIPE=$(echo $0 | sed "s/hooks.sh/hooks-named-pipe/g")
echo "{ ${VAR}\"session_id\": \"${SESSION_ID}\" }" > $PIPE