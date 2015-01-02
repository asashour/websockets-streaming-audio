
var render_streaming_web_audio = function() {

var audio_context;
var gain_node;
var streaming_node;
var BUFF_SIZE_AUDIO_RENDERER = null;
var cb_request_another_buffer = null;

var streaming_status_ready      = "streaming_status_ready";
var streaming_status_active     = "streaming_status_active";
var streaming_status_done       = "streaming_status_done";
var flag_streaming_status       = streaming_status_ready;

var init_web_audio = (function() {

	if (typeof audio_context !== "undefined") {

        return;     //      audio_context already defined
    }

    try {

        window.AudioContext = window.AudioContext       ||
                              window.webkitAudioContext ||
                              window.mozAudioContext    ||
                              window.oAudioContext      ||
                              window.msAudioContext;

        audio_context = new AudioContext();  //  cool audio context established

    } catch (e) {

        var error_msg = "Web Audio API is not supported by this browser\n" +
                        " ... http://caniuse.com/#feat=audio-api";
        console.error(error_msg);
        alert(error_msg);
        throw new Error(error_msg);
    }

    gain_node = audio_context.createGain(); // Declare gain node
    gain_node.connect(audio_context.destination); // Connect gain node to speakers

}());

function setup_onaudioprocess_callback_stream(given_node, cb_populate_memory_chunk, given_buff_size) {

    console.log("TOP setup_onaudioprocess_callback_stream");

    var internal_audio_buffer_obj = {};
    var buff_size_audio_renderer = given_buff_size;
    var aggregate_buffer_index = 0;
    var stop_next_event_loop_iteration = false;

    given_node.onaudioprocess = (function() {

        return function(event) {

            console.log("Middleburg  top of rendering callback ----------------------------------");

            queue_first_in_first_out.set_flag_audio_rendering(true);

            if (stop_next_event_loop_iteration || queue_first_in_first_out.get_request_stop()) {

                console.log("stop event loop");

                // given_node = null;

                stop_audio();
                
                return;
            }

            aggregate_buffer_index += buff_size_audio_renderer;

            // var rendered_everything = false;

            // if (queue_first_in_first_out.get_max_index()) {

            //     console.log("seeing max index of " + queue_first_in_first_out.get_max_index());
            // }

            var max_index = queue_first_in_first_out.get_max_index();

            console.log("aggregate_buffer_index " + aggregate_buffer_index);
            console.log("             max_index " + max_index);

            // if (max_index && (! (aggregate_buffer_index <= max_index))) {
            if (max_index && (aggregate_buffer_index > max_index)) {

                console.log("whoo yo yo yo ... limit reached");

                // queue_first_in_first_out.set_stop();

                // rendered_everything = true;

                stop_next_event_loop_iteration = true;
            }

            // if (rendered_everything || queue_first_in_first_out.get_flag_stop()) {

            //     console.log("stop event loop");

            //     given_node = null;

            //     stop_audio();
                
            //     return;
            // }

            // stens TODO - setup 2 channels
            internal_audio_buffer_obj.buffer = event.outputBuffer.getChannelData(0);

            cb_populate_memory_chunk(internal_audio_buffer_obj); // retrieve buffer data from circular queue


            // if (rendered_everything || queue_first_in_first_out.get_flag_stop()) {

            //     console.log("stop event loop");

            //     given_node = null;

            //     stop_audio();
                
            //     return;
            // }

            for (var i = 0; i < 1; i++) {

                console.log("audio render " + internal_audio_buffer_obj.buffer[i]);
            }

            cb_request_another_buffer("Middleburg");
        };
    }());
}           //      setup_onaudioprocess_callback_stream

// ---

var queue_first_in_first_out = (function() { // first in first out queue

    var audio_from_server_obj = {};
    var push_index = 0;
    var pop_index = 0;
    var browser_queue_max_size = 4;   //  maximum queue size
    var browser_queue_min_threshold = 2; //  triggers browser from consuming its own queue to reading ww queue
    var cb_browser_queue_is_full = null;
    var cb_browser_queue_min_reached = null;
    var curr_browser_queue_size = 0;
    // var cb_get_state = null;
    var max_index = null;

    // ~/Dropbox/Documents/code/github/websockets-streaming-audio/src_ce/thermostat.js

    var flag_index_is_rising = true; // trigger used to identify when traversing min threshold
    var flag_request_stop = false; // trigger to stop web audio api event loop

    var flag_audio_rendering = false;

    // ----------------- set of state transition variables ----------------- //

    // server fills up ww queue while browser consumes
    // its own queue undisturbed by server or ww
    // var mode_ww_get_audio_from_server      = "ww_get_audio_from_server";

    // no server calls here ww sends twice as much data 
    // to browser as it consumes so browser queue fills
    // var mode_browser_get_audio_from_ww     = "browser_get_audio_from_ww";

    // var browser_directed_mode = cb_get_state();

    return {
        is_production_possible : function() {

            var curr_size_queue = push_index - pop_index;

            var answer = ((push_index - pop_index) < browser_queue_max_size);

            console.log("is_BB_production_possible  answer " + answer);

            if (flag_index_is_rising && curr_size_queue >= browser_queue_max_size) {

                flag_index_is_rising = false; // thermostat threshold triggered - browser queue full

                cb_browser_queue_is_full(); // communicate this state change to state management

                console.log("NEW browser_directed_mode");
            }

            return answer;
        },
        push : function(given_audio_obj_from_server) {      // bbb

            var size_buffer_available = given_audio_obj_from_server.buffer.length;

            var offset_index = 0;
            while (size_buffer_available > offset_index) {

                // stens TODO - put this into ww not here in browser land

                var array_buffer = new ArrayBuffer(BUFF_SIZE_AUDIO_RENDERER * Float32Array.BYTES_PER_ELEMENT);
                var float_array = new Float32Array(array_buffer);

                for (var i = 0; i < BUFF_SIZE_AUDIO_RENDERER; i++) {

                    float_array.buffer[i] = given_audio_obj_from_server.buffer[i + offset_index];
                }

                // console.log("ccccccccccccccc float_array " + float_array.buffer[0]);

                audio_from_server_obj[push_index] = float_array;

                // console.log("post push value " + audio_from_server_obj[push_index].buffer[0]);

                push_index += 1;

                offset_index += BUFF_SIZE_AUDIO_RENDERER;

                curr_browser_queue_size += 1;

                console.log("PUSH curr_browser_queue_size " + curr_browser_queue_size);
            }
        },
        is_pop_possible : function() {

            var curr_size_queue = push_index - pop_index;

            if ((! flag_index_is_rising) && curr_size_queue <= browser_queue_min_threshold) {

                flag_index_is_rising = true; // thermostat threshold triggered - browser queue about empty

                cb_browser_queue_min_reached();
            }

            return (pop_index < push_index && flag_streaming_status !== streaming_status_done);
        },
        pop : function() {

            if (pop_index > 0) {

                delete audio_from_server_obj[pop_index - 1]; // destroy previously consumed entry
            }

            if (pop_index < push_index) {

                curr_browser_queue_size -= 1;

                console.log("POP curr_browser_queue_size " + curr_browser_queue_size);

                return audio_from_server_obj[pop_index++];

            } else {

                console.log("boo hoo queue_first_in_first_out is EMPTY so cannot do a pop");
            }
        },
        set_browser_queue_min_threshold : function(given_minimum_threshold) {

            browser_queue_min_threshold = given_minimum_threshold;

            console.log("set_browser_queue_min_threshold    browser_queue_min_threshold  ", browser_queue_min_threshold);
        },
        set_browser_queue_max_size : function(given_maximum_queue_size) {

            browser_queue_max_size = given_maximum_queue_size;

            console.log("set_browser_queue_max_size    browser_queue_max_size  ", browser_queue_max_size);
        },
        set_cb_browser_queue_is_full : function(given_callback) {

            cb_browser_queue_is_full = given_callback;

            console.log("hahahahaha given_callback NAME " + given_callback.name);
            console.log("hahahahaha cb_browser_queue_is_full NAME " + cb_browser_queue_is_full.name);
        },
        set_cb_browser_queue_min_reached : function(given_callback) {

            cb_browser_queue_min_reached = given_callback;
        },
        set_max_index : function(given_max_index) {

            max_index = given_max_index;

            console.log("set_max_index   max_index " + max_index);
        },
        get_max_index : function() {

            return max_index;
        },
        set_request_stop : function() {

            flag_request_stop = true;

            console.log("set_request_stop  flag_request_stop " + flag_request_stop);
        },
        get_request_stop : function() {

            return flag_request_stop; // retrieve flag to indicate whether to exit from web audio event loop
        },
        set_flag_audio_rendering : function() {

            flag_audio_rendering = true;
        },
        get_flag_audio_rendering : function() {

            return flag_audio_rendering;
        }
    };
}());       //      queue_first_in_first_out

var set_BUFF_SIZE_AUDIO_RENDERER = function(given_buff_size) {

    BUFF_SIZE_AUDIO_RENDERER = given_buff_size;
};

var get_another_buffer = (function () {

    return (function(given_audio_obj) {

        if (! queue_first_in_first_out.is_pop_possible()) {

            // stop_audio();

            return;

        } else {

            var audio_obj_from_queue = queue_first_in_first_out.pop();

            // if (! (typeof audio_obj_from_queue !== "undefined")) {
            if (typeof audio_obj_from_queue !== "undefined") {

            } else {

                throw new Error("ERROR - in get_another_buffer seeing undefined audio_obj_from_queue");
            }

            var size_buff = audio_obj_from_queue.length;

            for (var i = 0; i < size_buff; i++) {

                given_audio_obj.buffer[i] = audio_obj_from_queue.buffer[i];

                if (i < 1) {

                    console.log("FROM  " + audio_obj_from_queue.buffer[i] + 
                                "  TO  " + given_audio_obj.buffer[i]);
                }
            }
        }
    });
}());

var set_cb_request_another_buffer = function(given_callback) {

    cb_request_another_buffer = given_callback;
};

function stop_audio() {

    // queue_first_in_first_out.set_stop();

    streaming_node.disconnect(gain_node); // stens TODO why is this not enough to stop event loop

    streaming_node.onaudioprocess = null;

    streaming_node = null;

    console.log('stop_audio ... just called disconnect');
    console.log('stop_audio ... just called disconnect');
    console.log('stop_audio ... just called disconnect');

    flag_streaming_status = streaming_status_ready; // get ready for next time

    console.log("OK just set flag_streaming_status = streaming_status_ready");
}

function process_audio_buffer() { // only called upon initially retrieving audio fm svr

    console.log("top process_audio_buffer");

    // if (given_max_index) {
    //     console.log("aaaaaaaaawwesome  max_index " + given_max_index);
    //     queue_first_in_first_out.set_max_index(given_max_index);
    // }

    if (! queue_first_in_first_out.get_flag_audio_rendering() && (
        (! queue_first_in_first_out.is_production_possible())) ||
        cb_get_is_streaming_done()) {

        queue_first_in_first_out.set_flag_audio_rendering(true);

        console.log("about to request buffer          tell_ww_to_refill");

        cb_request_another_buffer("tell_ww_to_refill"); // stens TODO think this should be removed

        streaming_node = audio_context.createScriptProcessor(BUFF_SIZE_AUDIO_RENDERER, 1, 1);

        console.log("BUFF_SIZE_AUDIO_RENDERER ", BUFF_SIZE_AUDIO_RENDERER);

        console.log("OOOOOOOOOOOOOOOONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN activating gain_node");

        streaming_node.connect(gain_node);

        flag_streaming_status = streaming_status_active;

        console.log("OK just set flag_streaming_status    streaming_status_active");

        setup_onaudioprocess_callback_stream(streaming_node, get_another_buffer, BUFF_SIZE_AUDIO_RENDERER);

    } else {

        console.log("jjjjjjjjjjjjjj  early_days");

        cb_request_another_buffer("early_days");
    }
}

function set_cb_is_streaming_done(given_callback) {

    cb_get_is_streaming_done = given_callback;
}

function cb_send_buffer_to_web_audio_player(given_audio_obj, flag_early_or_not) {

    queue_first_in_first_out.push(given_audio_obj);

    if (flag_early_or_not) {

        process_audio_buffer(); // safe to do this since not competing with rendering processing   
    }
}

return {

    cb_send_buffer_to_web_audio_player : cb_send_buffer_to_web_audio_player,
    queue_first_in_first_out : queue_first_in_first_out,
    set_BUFF_SIZE_AUDIO_RENDERER : set_BUFF_SIZE_AUDIO_RENDERER,
    set_cb_request_another_buffer : set_cb_request_another_buffer,
    set_cb_is_streaming_done : set_cb_is_streaming_done,
    process_audio_buffer : process_audio_buffer
};

};       //      render_streaming_web_audio