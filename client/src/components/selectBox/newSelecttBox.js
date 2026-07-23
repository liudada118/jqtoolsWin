import React from 'react';
import { jet } from '../../util/util';

function toHex2(num) {
    return num.toString(16).padStart(2, '0');
}

export class BrushManager {
    constructor() {
        this.listeners = new Set();
        this.isBrushing = false;
        this.start = { x: 0, y: 0 };
        this.pointTopLeft = [];
        this.pointBottomRight = [];
        this.rangeArr = []
        this.selectIndex = 20
    }

    subscribe(cb) {
        this.listeners.add(cb);
    }

    unsubscribe(cb) {
        this.listeners.delete(cb);
    }

    notify(range) {
        console.log(this.listeners, range)
        this.listeners.forEach(cb => cb(range));
    }

    startBrush() {
        // if (this.isBrushing) return;
        this.isBrushing = true;
        window.addEventListener('mousedown', this.onMouseDown);
    }

    stopBrush() {
        this.isBrushing = false;
        // window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
    }

    onMouseDown = (e) => {
        this.isBrushing = true;
        this.start = { x: e.clientX, y: e.clientY };
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        this.element = document.createElement('div');
        this.element.classList.add('selectBox');
        // this.elementArr.push(this.element)
        this.element.style.pointerEvents = 'none';
        document.body.appendChild(this.element);

        this.element.style.left = e.clientX + 'px';
        this.element.style.top = e.clientY + 'px';
        this.element.style.width = '0px';
        this.element.style.height = '0px';

        // this.start.x = e.clientX;
        // this.start.y = e.clientY;


    };

    onMouseMove = (e) => {
        // if (!this.isBrushing) return;


        // this.start.x = e.clientX;
        // this.start.y = e.clientY;    
        console.log(this.start.x - e.clientX,this.start.y - e.clientY,this.isBrushing)
        if (this.isBrushing) {
            if (Math.abs(this.start.x - e.clientX) > 5 && Math.abs(this.start.y - e.clientY) > 5) {
                console.log('range')
                const bgc = jet(0, 200, this.selectIndex)
                this.element.classList.add(`selectBox${this.selectIndex}`);
                const r = bgc[0]
                const g = bgc[1]
                const b = bgc[2]

                //    console.log(`#${toHex2(r)}${toHex2(g)}${toHex2(b)}`)

                this.element.style.backgroundColor = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`
                this.element.style.opacity = 0.8
                this.element.style.display = 'block';

                this.pointBottomRight.x = Math.max(this.start.x, e.clientX);
                this.pointBottomRight.y = Math.max(this.start.y, e.clientY);
                this.pointTopLeft.x = Math.min(this.start.x, e.clientX);
                this.pointTopLeft.y = Math.min(this.start.y, e.clientY);

                this.element.style.left = this.pointTopLeft.x + 'px';
                this.element.style.top = this.pointTopLeft.y + 'px';
                this.element.style.width = (this.pointBottomRight.x - this.pointTopLeft.x) + 'px';
                this.element.style.height = (this.pointBottomRight.y - this.pointTopLeft.y) + 'px';

                this.range = {
                    x1: this.pointTopLeft.x,
                    y1: this.pointTopLeft.y,
                    x2: this.pointBottomRight.x,
                    y2: this.pointBottomRight.y,
                    bgc: `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`,
                    index : this.selectIndex
                }
            }
        }


    };

    onMouseUp = () => {
        console.log(this.pointBottomRight.x - this.pointTopLeft.x)
        if (this.pointBottomRight.x - this.pointTopLeft.x > 5 && this.pointBottomRight.y - this.pointTopLeft.y > 5) {
            this.selectIndex += 10
            this.rangeArr.push(this.range)
            this.notify(this.rangeArr);
            this.stopBrush();
            this.pointTopLeft = { x: 0, y: 0 }
            this.pointBottomRight = { x: 0, y: 0 }
        } else {
            document.body.removeChild(this.element);
            this.stopBrush();
        }

    };

    deleteSelect = (index) => {
        const elementIndex = this.rangeArr[index].index
        const element = document.querySelector(`.selectBox${elementIndex}`)
        this.rangeArr.splice(index, 1)
        document.body.removeChild(element)
        this.notify(this.rangeArr);
    }
}

// export const BrushContext = React.createContext(null);
export const brushInstance = new BrushManager();
