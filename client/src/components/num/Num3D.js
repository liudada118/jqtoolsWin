import React, { useEffect, useState, useImperativeHandle } from 'react'
import './num.css'
import { useEquipStore } from '../../store/equipStore';
import { shallow } from 'zustand/shallow';
var valuej1 = localStorage.getItem('carValuej') ? JSON.parse(localStorage.getItem('carValuej')) : 200,
    valueg1 = localStorage.getItem('carValueg') ? JSON.parse(localStorage.getItem('carValueg')) : 2,
    value1 = localStorage.getItem('carValue') ? JSON.parse(localStorage.getItem('carValue')) : 2,
    valuel1 = localStorage.getItem('carValuel') ? JSON.parse(localStorage.getItem('carValuel')) : 2,
    valuef1 = localStorage.getItem('carValuef') ? JSON.parse(localStorage.getItem('carValuef')) : 2,
    valuelInit1 = localStorage.getItem('carValueInit') ? JSON.parse(localStorage.getItem('carValueInit')) : 2



function jet(min, max, x) {
    let r, g, b;
    let dv;
    r = 1;
    g = 1;
    b = 1;
    if (x < min) x = min;
    if (x > max) x = max;
    dv = max - min;
    if (x < min + 0.25 * dv) {
        r = 0;
        g = (4 * (x - min)) / dv;
    } else if (x < min + 0.5 * dv) {
        r = 0;
        b = 1 + (4 * (min + 0.25 * dv - x)) / dv;
    } else if (x < min + 0.75 * dv) {
        r = (4 * (x - min - 0.5 * dv)) / dv;
        b = 0;
    } else {
        g = 1 + (4 * (min + 0.75 * dv - x)) / dv;
        b = 0;
    }
    var rgb = new Array();
    rgb[0] = parseInt(255 * r);
    rgb[1] = parseInt(255 * g);
    rgb[2] = parseInt(255 * b);
    return rgb;
}

function boxesForGauss(sigma, n)  // standard deviation, number of boxes
{
    var wIdeal = Math.sqrt((12 * sigma * sigma / n) + 1);  // Ideal averaging filter width
    var wl = Math.floor(wIdeal);
    if (wl % 2 == 0) wl--;
    var wu = wl + 2;
    var mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
    var m = Math.round(mIdeal);
    var sizes = [];
    for (var i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
    return sizes;
}

function gaussBlur_2(scl, tcl, w, h, r) {
    var bxs = boxesForGauss(r, 3);
    boxBlur_2(scl, tcl, w, h, (bxs[0] - 1) / 2);
    boxBlur_2(tcl, scl, w, h, (bxs[1] - 1) / 2);
    boxBlur_2(scl, tcl, w, h, (bxs[2] - 1) / 2);
}

function boxBlur_2(scl, tcl, w, h, r) {
    for (var i = 0; i < h; i++)
        for (var j = 0; j < w; j++) {
            var val = 0;
            for (var iy = i - r; iy < i + r + 1; iy++)
                for (var ix = j - r; ix < j + r + 1; ix++) {
                    var x = Math.min(w - 1, Math.max(0, ix));
                    var y = Math.min(h - 1, Math.max(0, iy));
                    val += scl[y * w + x];
                }
            tcl[i * w + j] = val / ((r + r + 1) * (r + r + 1));
        }
}


const Num = ((props) => {
    let width = 32, canvasheight = 32
    if (props.matrixName == 'carCol') {
        width = 10
        canvasheight = 9
    }
    const [data, setData] = useState(new Array(canvasheight).fill(new Array(width).fill(0)));
    const [scale, setScale] = useState(1)





    const displayStatus = useEquipStore(s => s.displayStatus, shallow);
    const displayType = useEquipStore(s => s.displayType, shallow);
    const systemType = useEquipStore(s => s.systemType, shallow);
    const settingValue = useEquipStore(s => s.settingValue, shallow);

    const {
        gauss = 1, color, filter, height = 1, coherent = 1
    } = settingValue

    let ndata
    if (displayType == 'back3D') {
        ndata = displayStatus['back']
    } else if (displayType == 'sit3D') {
        ndata = displayStatus['sit']
    } else {
        ndata = displayStatus[systemType]
        if (!ndata) ndata = new Array(1024).fill(0)
    }
    if (!ndata) ndata = new Array(1024).fill(0)


    let dataG = []
    gaussBlur_2(ndata, dataG, width, canvasheight, 1)


    // wsPointData = dataG

    let Matirx = [];
    for (let i = 0; i < canvasheight; i++) {
        Matirx[i] = [];
        for (let j = 0; j < width; j++) {
            Matirx[i].push(dataG[i * width + j]);
        }
    }

    // // wsPointData = a;
    // setData(a);

    function changeScale() {
        var WW = document.documentElement.clientHeight
        var scaleNum = WW / 1240
        setScale(scaleNum)
    }

    useEffect(() => {
        // var WW = document.documentElement.clientHeight
        // var scaleNum = WW / 1020
        // setScale(scaleNum)
        changeScale()




        window.addEventListener('resize', changeScale)
        return (() => {
            changeScale()
        })
    }, []);

    // const {
    //     gauss = 1, color, filter, height = 1, coherent = 1
    // } = getSettingValue()


    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#000',
                // alignItems: 'center'
            }}
        >
            <div
                className="threeBoxF"
                style={{
                    color: 'blue', transformStyle: 'preserve-3d',
                    perspective: '800px',

                }}
            >
                <div className="threeBox"
                    style={{ transform: 'rotateX(35deg)' }}
                >
                    {Matirx.map((items, indexs) => {
                        return (
                            <div key={indexs} style={{ display: 'flex' }}>
                                {items && items.length
                                    ? items.map((item, index) => {
                                        return (
                                            <div
                                                key={index}
                                                style={{
                                                    width: `${2 * scale}rem`,
                                                    color: 'blue',
                                                    fontSize: `${scale * 20 * 0.7}px`,
                                                    lineHeight: `${1.5 * scale}rem`,
                                                    transform: `translateY(${-item * 3*height}px)`,
                                                    color: `rgb(${jet(0, color, item * 5)})`,
                                                }}
                                            >
                                                {parseInt(item)}
                                            </div>
                                        );
                                    })
                                    : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
})

export default Num