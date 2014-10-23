/*!
 * Event Burrito is a touch / mouse / pointer event unifier
 * https://github.com/wilddeer/Event-Burrito
 * Copyright Oleg Korsunsky | http://wd.dizaina.net/
 *
 * MIT License
 */
function EventBurrito(_this, options) {

    var noop = function() {},
        o = {
            preventDefault: true,
            clickTolerance: 0,
            preventScroll: false,
            mouse: true,
            start: noop,
            move: noop,
            end: noop,
            click: noop
        };

    //merge user options into defaults
    options && mergeObjects(o, options);

    var support = {
            pointerEvents: !!window.navigator.pointerEnabled,
            msPointerEvents: !!window.navigator.msPointerEnabled
        },
        start = {},
        diff = {},
        speed = {},
        stack = [],
        listeners = [],
        isScrolling,
        eventType,
        clicksAllowed = true, //flag allowing default click actions (e.g. links)
        eventModel = (support.pointerEvents? 1 : (support.msPointerEvents? 2 : 0)),
        events = [
            ['touchstart', 'touchmove', 'touchend', 'touchcancel'], //touch events
            ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'], //pointer events
            ['MSPointerDown', 'MSPointerMove', 'MSPointerUp', 'MSPointerCancel'], //IE10 pointer events
            ['mousedown', 'mousemove', 'mouseup', false] //mouse events
        ],
        //some checks for different event types
        checks = [
            //touch events
            function(e) {
                //skip the event if it's multitouch or pinch move
                return (e.touches && e.touches.length > 1) || (e.scale && e.scale !== 1);
            },
            //pointer events
            function(e) {
                //Skip it, if:
                //1. event is not primary (other pointers during multitouch),
                //2. left mouse button is not pressed,
                //3. mouse drag is disabled and event is not touch
                return !e.isPrimary || (e.buttons && e.buttons !== 1) || (!o.mouse && e.pointerType !== 'touch' && e.pointerType !== 'pen');
            },
            //IE10 pointer events
            function(e) {
                //same checks as in pointer events
                return !e.isPrimary || (e.buttons && e.buttons !== 1) || (!o.mouse && e.pointerType !== e.MSPOINTER_TYPE_TOUCH && e.pointerType !== e.MSPOINTER_TYPE_PEN);
            },
            //mouse events
            function(e) {
                //skip the event if left mouse button is not pressed
                //in IE7-8 `buttons` is not defined, in IE9 LMB is 0
                return (e.buttons && e.buttons !== 1);
            }
        ];

    function mergeObjects(targetObj, sourceObject) {
        for (var key in sourceObject) {
            if (sourceObject.hasOwnProperty(key)) {
                targetObj[key] = sourceObject[key];
            }
        }
    }

    function addEvent(el, event, func, bool) {
        if (!event) return;

        el.addEventListener? el.addEventListener(event, func, !!bool): el.attachEvent('on'+event, func);

        //return event remover to easily remove anonymous functions later
        return {
            remove: function() {
                removeEvent(el, event, func, bool);
            }
        };
    }

    function removeEvent(el, event, func, bool) {
        if (!event) return;

        el.removeEventListener? el.removeEventListener(event, func, !!bool): el.detachEvent('on'+event, func);
    }

    function preventDefault(event) {
        event.preventDefault? event.preventDefault() : event.returnValue = false;
    }

    function getDiff(event) {
        diff = {
            x: (eventType? event.clientX : event.touches[0].clientX) - start.x,
            y: (eventType? event.clientY : event.touches[0].clientY) - start.y,

            time: Number(new Date) - start.time
        };

        if (diff.time - stack[stack.length - 1].time) {
            for (var i = 0; i < stack.length - 1 && diff.time - stack[i].time > 80; i++);

            speed = {
                x: (diff.x - stack[i].x) / (diff.time - stack[i].time),
                y: (diff.y - stack[i].y) / (diff.time - stack[i].time)
            };

            if (stack.length >= 5) stack.shift();
            stack.push({x: diff.x, y: diff.y, time: diff.time});
        }
    }

    function tStart(event, eType) {
        clicksAllowed = true;
        eventType = eType; //leak event type

        if (checks[eventType](event)) return;

        //attach event listeners to the document, so that the slider
        //will continue to recieve events wherever the pointer is
        addEvent(document, events[eventType][1], tMove);
        addEvent(document, events[eventType][2], tEnd);
        addEvent(document, events[eventType][3], tEnd);

        //fixes WebKit's cursor while dragging
        if (o.preventDefault && eventType) preventDefault(event);

        //remember starting time and position
        start = {
            x: eventType? event.clientX : event.touches[0].clientX,
            y: eventType? event.clientY : event.touches[0].clientY,

            time: Number(new Date)
        };

        //reset
        isScrolling = undefined;
        diff = {x:0, y:0, time: 0};
        speed = {x:0, y:0};
        stack = [{x:0, y:0, time: 0}];

        o.start(event, start);
    }

    function tMove(event) {
        //if user is trying to scroll vertically -- do nothing
        if ((!o.preventScroll && isScrolling) || checks[eventType](event)) return;

        getDiff(event);

        if (Math.abs(diff.x) > o.clickTolerance || Math.abs(diff.y) > o.clickTolerance) clicksAllowed = false; //if there was a move -- deny all the clicks before the next touchstart

        //check whether the user is trying to scroll vertically
        if (isScrolling === undefined && eventType !== 3) {
            //assign and check `isScrolling` at the same time
            if (isScrolling = (Math.abs(diff.x) < Math.abs(diff.y)) && !o.preventScroll) return;
        }

        if (o.preventDefault) preventDefault(event); //Prevent scrolling

        o.move(event, start, diff, speed);
    }

    function tEnd(event) {
        eventType && getDiff(event);

        //IE likes to focus links after touchend.
        //Since we don't want to disable link outlines completely for accessibility reasons,
        //we just defocus it after touch and disable the outline for `:active` links in css.
        //This way the outline will remain visible when using keyboard.
        !clicksAllowed && event.target && event.target.blur && event.target.blur();

        //detach event listeners from the document
        removeEvent(document, events[eventType][1], tMove);
        removeEvent(document, events[eventType][2], tEnd);
        removeEvent(document, events[eventType][3], tEnd);

        o.end(event, start, diff, speed);
    }

    function init() {
        //bind touchstart
        listeners.push(addEvent(_this, events[eventModel][0], function(e) {tStart(e, eventModel);}));
        //prevent stuff from dragging when using mouse
        listeners.push(addEvent(_this, 'dragstart', preventDefault));

        //bind mousedown if necessary
        if (o.mouse && !eventModel) {
            listeners.push(addEvent(_this, events[3][0], function(e) {tStart(e, 3);}));
        }

        //No clicking during touch
        listeners.push(addEvent(_this, 'click', function(event) {
            clicksAllowed? o.click(event): preventDefault(event);
        }));
    }

    init();

    //expose the API
    return {
        getClicksAllowed: function() {
            return clicksAllowed;
        },
        kill: function() {
            for (var i = listeners.length - 1; i >= 0; i--) {
                listeners[i].remove();
            }
        }
    }
}
