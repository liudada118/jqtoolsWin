
let oldDate = 0
const HZ = 8
setInterval(() => {
    const newDate = new Date().getTime()
    if (newDate - oldDate > 1000 / HZ) {
        console.log(newDate, '111')
        oldDate = newDate
    }
}, 80)


setInterval(() => {
    const newDate = new Date().getTime()

    console.log(newDate, '222')

}, 125)

