export function calMatrixArea(canvasArea, selectArea) {
    const { canvasX1, canvasX2, canvasY1, canvasY2 } = canvasArea
    const { selectX1, selectX2, selectY1, selectY2 } = selectArea

    const canvasWidth = canvasX2 - canvasX1
    const canvasHeight = canvasY2 - canvasY1
    const widthUtil = canvasWidth / 64
    const heightUtil = canvasHeight / 64

    const xStart = Math.floor((selectX1 - canvasX1) / widthUtil)
    const xEnd = Math.ceil((selectX2 - canvasX1) / widthUtil)
    const yStart = Math.floor((selectY1 - canvasY1) / widthUtil)
    const yEnd = Math.ceil((selectY2 - canvasY1) / heightUtil)

    return {
        xStart , xEnd , yStart , yEnd
    }
}