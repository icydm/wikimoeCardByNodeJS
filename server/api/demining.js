var utils = require('../utils/utils');
var deminingModel = require('../models/demining');
var md5 = require('md5-node');
var usersModel = require('../models/users');

var mineSweepingMap = function (returnData) {
    //20,30
    let randomRowsCols = utils.randomNum(2,2);
    let r = randomRowsCols;
    let c = randomRowsCols;
    //20,80
    let num = utils.randomNum(1,2);
    var map = []
    // 给行数，生成一个 1 维数组
    var row = function (r) {
        for (var i = 0; i < r; i++) {
            map[i] = new Array()
        }
    }
    // 给列数，生成一个 2 维数组
    var column = function (col) {
        for (var i = 0; i < map.length; i++) {
            for (var j = 0; j < col; j++) {
                map[i][j] = 0
            }
        }
    }
    // 给列数和行数生成空地图
    var blankMap = function (r, col) {
        row(r)
        column(col)
    }

    // 给出地雷数量让后随机写入地雷
    var writeInMine = function (num) {
        // 随机位置写入
        var randomLocation = function () {
            var x = Math.floor(Math.random() * r)
            var y = Math.floor(Math.random() * c)
            // console.log( ':', x, y);
            if (map[x][y] !== 9) {
                map[x][y] = 9
            } else {
                randomLocation()
            }
        }
        for (var i = 0; i < num; i++) {
            randomLocation()
        }
    }

    // 使用循环给雷的边上所有数 +1 , 已经是雷的除外
    var plus = function (array, x, y) {
        if (x >= 0 && x < r && y >= 0 && y < c) {
            if (array[x][y] !== 9) {
                array[x][y] += 1
            }
        }
    }
    var writeInHint = function () {
        for (var x = 0; x < map.length; x++) {
            for (var y = 0; y < map[0].length; y++) {
                if (map[x][y] === 9) {
                    // 上下 6 个
                    for (var i = -1; i < 2; i++) {
                        plus(map, x - 1, y + i)
                        plus(map, x + 1, y + i)
                    }
                    // 左右 2 个
                    plus(map, x, y + 1)
                    plus(map, x, y - 1)
                }
            }
        }
    }

    blankMap(r, c)
    writeInMine(num)
    writeInHint()
    let time = Math.round(new Date().getTime()/1000);
    let randomMapType  = utils.randomNum(1,17)
    let data = {
        map:map,
        creatTime:time,
        mapType:randomMapType,
        boomNum:num,
        boomedNum:0,
        rows:r,
        cols:c,
        player:null,
        close:0
    }
    // document作成
    var demining = new deminingModel(data);

    // document保存
    demining.save(function(err) {
        if (err) throw err;
        
    });
    if(returnData){
        delete data.boomedNum;
        delete data.boomNum;
        delete data.map;
        console.log(data);
        return data
    }
}

var getMineMap = function(socket,cast){
    deminingModel.findOne({ close: 0 },'-_id creatTime mapType rows cols player close', (err, result)=> {
        if (err) {
            socket.emit('demining',{code:1,msg:'内部错误请联系管理员！'});
            throw err;
        }else{
            //判断是否有数据
            if(result){
                let resData = {
                    data:result,
                    code:0
                };
                socket.emit('demining',resData);
                if(cast){
                    socket.broadcast.emit('demining',resData);
                }
            }else{
                let mineData = mineSweepingMap(true);
                let resData = {
                    data:mineData,
                    code:0
                };
                socket.emit('demining',resData);
                if(cast){
                    socket.broadcast.emit('demining',resData);
                }
            }
        }
    });
}
var openNode = function(socket,data){
    deminingModel.findOne({ close: 0 }, (err, result)=> {
        if (err) {
            socket.emit('demining',{code:1,msg:'内部错误请联系管理员！'});
            throw err;
        }else{
            //判断是否有数据
            if(result){
                let x = data.x || 0;
                let y = data.y || 0;
                if(result.player){
                    if(result.player[y+'_'+x]){
                        socket.emit('demining',{code:1,msg:'此处已经被人抢先！'});
                        return false;
                    }
                }
                if(result.creatTime!=data.creatTime){
                    socket.emit('demining',{code:1,msg:'矿场不正确，请刷新查看！'});
                    return false;
                }
                let playData = result.player;
                let demNum = result.map[y][x];
                let boomedNum = result.boomedNum;
                let boomNum = result.boomNum;
                let close = result.close;
                let starAdd = 0;
                if(playData===null){
                    playData = {};
                }
                playData[y+'_'+x] = {
                    md5:md5(data.email),
                    num:demNum
                };
                if(demNum==9){
                    boomedNum = boomedNum +1;
                    starAdd = utils.randomNum(20,40);
                }
                if(boomedNum>=boomNum){
                    close = 1;
                }
                if(starAdd>0){
                    usersModel.updateOne({email: data.email}, {$inc:{star:starAdd}}, function(err, docs){
                        if(err) {
                            throw err;
                        }else{
                            socket.emit('demining',{code:2,star:starAdd});
                        }
                    });
                }
                deminingModel.updateOne({close: 0}, {player:playData,boomedNum:boomedNum,close:close}, function(err, docs){
                    if(err) {
                        socket.emit('demining',{code:1,msg:'内部错误请联系管理员！'});
                        throw err;
                    }else{
                        getMineMap(socket,true);
                    }
                });
            }else{
                socket.emit('demining',{code:1,msg:'内部错误请联系管理员！'});
            }
        }
    });
}
exports.mine = function(socket,data){
    if(data.email&&data.token){
        usersModel.findOne({ email: data.email }, function(err, result) {
            if (err) {
                socket.emit('demining',{code:1,msg:'内部错误请联系管理员！'});
                throw err;
            }else{
                //判断是否有该用户
                if(result){
                    if(result.token!=data.token){
                        console.log('登录信息已过期！');
                        socket.emit('demining',{code:403,msg:'登录信息已过期！'});
                        return false;
                    }else{
                        //开始处理挖矿逻辑
                        if(data.type=='get'){
                            console.log('获取挖矿地图');
                            getMineMap(socket,false);
                        }else if(data.type=='open'){
                            openNode(socket,data);
                        }
                    }
                }else{
                    socket.emit('demining',{code:403,msg:'无该用户！'});
                    return false;
                }
            }
        });
    }else{
        socket.emit('demining',{code:403,msg:'参数有误！'});
        return false;
    }
}