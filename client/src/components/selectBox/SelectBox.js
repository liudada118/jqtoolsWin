import { Vector2 } from 'three';

class SelectionHelper {



    constructor(renderer, cssClassName) {


        this.cssClassName = cssClassName
        this.renderer = renderer;
        this.elementArr = []
        this.startPoint = new Vector2();
        this.pointTopLeft = new Vector2();
        this.pointBottomRight = new Vector2();
        this.isShiftPressed = false;
        this.isDown = false;
        this.isKey = false;
        this.shiftFlag = 0
        this.elementDownFlag = false
        this.pointStart = new Vector2();

        this.onPointerDown = function (event) {

            this.isDown = true;
            if (!this.isKey) {
                this.onSelectStart(event);
            } else {
                this.setStartPoint(event)
            }


        }.bind(this);

        this.onPointerMove = function (event) {
            console.log(this.isShiftPressed, this.isDown)
            if (this.isShiftPressed) {
                if (this.isDown) {
                    this.onSelectMove(event);

                }
            }


        }.bind(this);

        this.onPointerUp = function () {

            this.isDown = false;
            // this.onSelectOver();

        }.bind(this);






        document.body.addEventListener('pointerdown', this.onPointerDown);
        document.body.addEventListener('pointermove', this.onPointerMove);
        document.body.addEventListener('pointerup', this.onPointerUp);

    }



    subscribe(cb) {
        this.listeners.add(cb);
    }

    notify(range) {
        this.listeners.forEach(cb => cb(range));
    }

    dispose() {

        document.body.removeEventListener('pointerdown', this.onPointerDown);
        document.body.removeEventListener('pointermove', this.onPointerMove);
        document.body.removeEventListener('pointerup', this.onPointerUp);

    }

    onSelectStart(event) {

        if (this.isShiftPressed) {
            // this.element.style.display = 'none';
            this.element = document.createElement('div');
            this.element.classList.add(this.cssClassName);
            this.elementArr.push(this.element)
            this.element.style.pointerEvents = 'none';
            document.body.appendChild(this.element);

            this.element.style.left = event.clientX + 'px';
            this.element.style.top = event.clientY + 'px';
            this.element.style.width = '0px';
            this.element.style.height = '0px';

            this.startPoint.x = event.clientX;
            this.startPoint.y = event.clientY;
        }
    }


    onSelectMove(event) {

        // 按下shift键

        this.element.style.display = 'block';

        this.pointBottomRight.x = Math.max(this.startPoint.x, event.clientX);
        this.pointBottomRight.y = Math.max(this.startPoint.y, event.clientY);
        this.pointTopLeft.x = Math.min(this.startPoint.x, event.clientX);
        this.pointTopLeft.y = Math.min(this.startPoint.y, event.clientY);

        this.element.style.left = this.pointTopLeft.x + 'px';
        this.element.style.top = this.pointTopLeft.y + 'px';
        this.element.style.width = (this.pointBottomRight.x - this.pointTopLeft.x) + 'px';
        this.element.style.height = (this.pointBottomRight.y - this.pointTopLeft.y) + 'px';


    }

    onSelectOver() {
        if (this.element) {
            this.element.parentElement?.removeChild(this.element);
        }


    }

}

export { SelectionHelper };