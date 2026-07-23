import { message } from "antd"

function determineParity(index) {
    return index % 2 == 0
}

function drawBlock(ctx, type) {

}

function drawLine(ctx,) {

}

function drawRoundRectWithText(ctx, x, y, width, height, radius, fillColor, text, textColor = '#fff', fontSize = 16, fontFamily = 'sans-serif') {
    // ---- 绘制圆角矩形 ----
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    // ---- 绘制文字 ----
    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 自动计算文字位置（居中）
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    ctx.fillText(text, centerX, centerY);
}


class ruler {
    constructor() {
        this.listeners = []
        this.rulersFlag = false
        // this.rulerState = 'start'
        this.selectIndex = 20
        this.clickIndex = 0
        this.width = 32
        this.height = 32
        this.distanceX = 6
        this.distanceY = 6
        this.onClick = (e) => {
            this.clickIndex++
            this.listeners.push({ pageX: e.pageX, pageY: e.pageY })
            const ctx = this.canvas.getContext('2d');
            if (determineParity(this.clickIndex)) {
                this.drawBlock(ctx, 'end', { pageX: e.pageX, pageY: e.pageY }, this.listeners[this.listeners.length - 2])
                this.drawLine(ctx, { pageX: e.pageX, pageY: e.pageY }, this.listeners[this.listeners.length - 2])
            } else {
                this.drawBlock(ctx, 'start', { pageX: e.pageX, pageY: e.pageY })
            }

        }
    }

    subscribe(cb) {
        this.listeners.add(cb);
    }

    unsubscribe(cb) {
        this.listeners.delete(cb);
    }

    startRuler({ num, widthDistance, heightDistance }) {
        this.width = num
        this.height = num
        this.distanceX = widthDistance
        this.distanceY = heightDistance
        this.rulersFlag = true
        // this
        // window.addEventListener('click', (e) => this.onClick(e));
        if (document.querySelector('.canvasRuler')) {
            const that = this
            this.canvas = document.querySelector('.canvasRuler')
            this.canvas.addEventListener('click', this.onClick)
        } else {
            message.info('请在2D模式下使用')
        }
    }

    stopRuler() {
        const that = this
        this.clickIndex = 0
        this.canvas.removeEventListener('click', this.onClick)
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    }

    drawBlock(ctx, type, pointInfo,startPointInfo) {
        const startX = this.canvas.getBoundingClientRect().left
        const startY = this.canvas.getBoundingClientRect().top

        const propW = this.canvas.width / this.width
        const propH = this.canvas.height / this.height

        const newX = Math.floor((pointInfo.pageX - startX) / (propW))
        const newY = Math.floor((pointInfo.pageY - startY) / (propH))

        console.log(newX * propW, newY * propH, propW, propH)

       

        ctx.fillStyle = "#FF0000";
        // ctx.fillRect(newX * propW, newY * propH, propW, propH);
        ctx.beginPath();
        ctx.arc((newX + 0.5) * propW, (newY + 0.5) * propH, propW / 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';        // 设置填充颜色
        ctx.fill();

        ctx.font = `${propH}px sans-serif`;
        if (type == 'start') {
            ctx.fillStyle = '#fff';
            ctx.fillText(`S`, (newX - 0.5) * propW, (newY + 0.5) * propH);
        } else {

             const newStartX = Math.floor((startPointInfo.pageX - startX) / (propW))
        const newStartY = Math.floor((startPointInfo.pageY - startY) / (propH))

        const x = Math.abs(newX - newStartX) * this.distanceX
        const y = Math.abs(newY - newStartY) * this.distanceY

        const distance = (Math.sqrt(x * x + y * y)).toFixed(0)
            // ctx.fillStyle = '#fff';
            // ctx.fillText(`E`, (newX + 0.2) * propW, (newY + 0.8) * propH);
            const fontsize = propH
            const width = `${distance}mm`.length * propH
            drawRoundRectWithText(ctx,  (newX + 1) * propW, (newY -0.5) * propH +2, width, propH + 4, (propH + 4)/2, '#fff', `${distance}mm`, '#000', propH)
        }
    }

    drawLine(ctx, pointInfo, startPointInfo) {
        const startX = this.canvas.getBoundingClientRect().left
        const startY = this.canvas.getBoundingClientRect().top


        const propW = this.canvas.width / this.width
        const propH = this.canvas.height / this.height

        const newEndX = Math.floor((pointInfo.pageX - startX) / (propW))
        const newEndY = Math.floor((pointInfo.pageY - startY) / (propH))

        const newStartX = Math.floor((startPointInfo.pageX - startX) / (propW))
        const newStartY = Math.floor((startPointInfo.pageY - startY) / (propH))

        ctx.beginPath();
        ctx.strokeStyle = '#fff'
        console.log(startPointInfo.pageX, startPointInfo.pageY, pointInfo.pageX, pointInfo.pageY)
        ctx.moveTo((newStartX + 0.5) * propW, (newStartY + 0.5) * propH);
        ctx.lineTo((newEndX + 0.5) * propW, (newEndY + 0.5) * propH);
        ctx.stroke();

        const x = Math.abs(newEndX - newStartX) * this.distanceX
        const y = Math.abs(newEndY - newStartY) * this.distanceY

        const distance = (Math.sqrt(x * x + y * y)).toFixed(0)

        // ctx.font = `${propH}px sans-serif`;
        // ctx.fillStyle = '#fff';
        // ctx.fillText(distance, (newStartX + newEndX) / 2 * propW, (newStartY + newEndY + 1) / 2 * propH);

    }

    // onClick
}

export const newRuler = new ruler()