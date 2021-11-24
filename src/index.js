#!/usr/bin/env node
// yapi代理实现
const axios = require('axios').default;
const http = require('http');
const qs = require('querystring');
const gitConfig = require('./config.js');
let config = null;
// 数据缓存
const cache = {
    // 缓存的项目下的api列表 如果状态更改需要重启服务
    apiList: [],
    // 公共api缓存
    commonApiList: []
};
// 公共配置
let commonConf = {};

// 获取公共api接口
const getCommonApiList = function (callback) {
    const apiUrl = `${config.apiUrl}/api/interface/list?token=${commonConf.token}&limit=1000`;
    // 获取制定分离id获取接口列表
    axios.get(apiUrl).then(response => {
        // 处理成功情况
        const data = response.data.data;
        // 缓存一份
        cache.commonApiList = data.list;
        callback();
    }).catch(error => {
        console.log('\x1B[33m%s', error);
    });
}

/**
 * 统一请求header处理
 * @param {Object} req request请求对象 
 * @returns 
 */
const getHeader = function (req) {
    const ret = {};
    for (let i in req.headers) {
        if (!/^(host|connection|Access-|origin|X-Requested-With)/i.test(i)) {
            ret[i] = req.headers[i];
        }
    }
    ret["accept"] = "*/*";
    ret["content-type"] = "application/json;charset=UTF-8";
    return ret
};


/**
 * 代理真实接口
 * @param {Object} req request对象
 * @param {Object} res response对象
 */
const proxyApi = function (req, res) {
    // 暂时只判断post和get
    if (req.method.toLowerCase() === 'post') {
        let getData = ""
        req.on("data", (data) => {
            getData += data
        })
        req.on("end", () => {
            const reqUrl = `${realUrl}${req.url}`;
            axios.post(reqUrl, getData, { headers: getHeader(req) })
                .then(function (response) {
                    // 处理成功情况
                    console.log(response.data);
                    // 写入响应头header
                    res.writeHead(response.status, response.headers);
                    res.write(JSON.stringify(response.data));
                    res.end();
                })
                .catch(function (error) {
                    // 处理错误情况
                    if (error.response) {
                        console.log('\x1B[31m%s', '真实接口post请求错误存在response');
                        res.writeHead(error.response.status, error.response.headers);
                        res.write(error.response.data instanceof Object ? JSON.stringify(error.response.data) : error.response.data);
                        res.end();
                    } else {
                        console.log('\x1B[33m%s', error);
                    }
                })
            });
    } else {
        const fullUrl = realUrl + req.url;
        axios.get(fullUrl, { headers: getHeader(req) })
            .then(function (response) {
                // 处理成功情况
                res.writeHead(response.status, response.headers);
                res.write(JSON.stringify(response.data));
                res.end();
            })
            .catch(function (error) {
                // 处理错误情况
                if (error.response) {
                    console.log('\x1B[31m%s', '真实接口get请求错误存在response');
                    res.writeHead(error.response.status, error.response.headers);
                    res.write(error.response.data instanceof Object ? JSON.stringify(error.response.data) : error.response.data);
                    res.end();
                } else {
                    console.log('\x1B[33m%s', error);
                }
            })
    }
};

/**
 * mock处理
 * @param {Object} req request对象
 * @param {Object} res response对象
 * @param {Number} type 是否是公共接口 1是
 */
const mockHandle = function (req, res, type) {
    const ID = type === 1 ? commonConf.id : catId;
    // mock地址
    let reqApi = req.url.replace(/\/api\/spkadmin/, "");
    const mockUrl = `${config.apiUrl}/mock/${ID}${reqApi}`;
    // 暂时只判断post和get
    if (req.method.toLowerCase() === 'post') {
        let getData = ""
        req.on("data", (data) => {
            getData += data
        })
        req.on("end", () => {
        const data = qs.parse(getData);
        axios.post(mockUrl, data, { headers: getHeader(req) })
            .then(function (response) {
                // 处理成功情况
                console.log(response.data);
                // 写入响应头header
                res.writeHead(response.status, response.headers);
                res.write(JSON.stringify(response.data));
                res.end();
            })
            .catch(function (error) {
                // 处理错误情况
                console.log('\x1B[33m%s', error);
            })
        });
    } else {
        const fullUrl = req.headers['x-forwarded-proto'] + '://' + req.headers['x-forwarded-host'] + reqApi;
        const myUrl = new URL(fullUrl);
        query = myUrl.search;
        const url = mockUrl + query;
        axios.get(url, { headers: getHeader(req) })
            .then(function (response) {
                // 处理成功情况
                console.log(response.data);
                res.writeHead(response.status, response.headers);
                res.write(response.data);
                res.end();
            })
            .catch(function (error) {
                // 处理错误情况
                console.log('\x1B[33m%s', error);
            })
    }
}

/**
 * 获取接口信息
 * @param {String} id  接口id
 * @param {String} token 项目token
 */
const getApiStatus = async function (id, token) {
    try {
        const apiUrl = `${config.apiUrl}/api/interface/get?token=${token}&id=${id}`;
        const { data, status } = await axios.get(apiUrl);
        let res;
        if (status === 200) {
            res = data.data.status;
        }
        return res;
    } catch (error) {
        console.log('\x1B[31m%s', error);
    }
}
// 公共接口下一步处理
const handleCommonApiNext = async function (apiList, token, req, res) {
    // 寻找有没有当前的接口
    const matchs = req.url.match(/.+(?=\?)/);
    const reqApi = matchs ? matchs[0] : req.url;
    const getApiItem = apiList.find(ele => {
        // 如果有请求的这个接口 reu.url为全路径，包含query
        // 处理没有/情况
        const existPath = ele.path.match(/^\//) ? ele.path : '/' + ele.path;
        if (reqApi === '/backend-api' + existPath) {
            return true;
        }
    });
    // 如果找不到调用真实接口
    if (!getApiItem) {
        proxyApi(req, res);
        return;
    }
    // 实时获取接口状态  不要从缓存里取
    const status = await getApiStatus(getApiItem._id, token);
    const devStatus = status || getApiItem.status;
    // 如果状态开发完成则直接调用真实接口
    if (devStatus === 'done') {
        console.log('此公共接口已开发完成，获取真实数据');
        proxyApi(req, res)
    } else {
        console.log('此公共接口未开发完成，开始从mock获取数据');
        mockHandle(req, res, 1);
    }
}

// 接口处理
const handleApiNext = async function (apiList, token, req, res) {
    // 寻找有没有当前的接口

    const matchs = req.url.match(/.+(?=\?)/); // 匹配接口
    let reqApi = matchs ? matchs[0] : req.url;
    // 私设，因为yapi上路径和实际路径不一样，暂时直接清除和yapi匹配
    reqApi = reqApi.replace(/\/api\/spkadmin/, "");
    const getApiItem = apiList.find(ele => {
        // 如果有请求的这个接口 reu.url为全路径，包含query
        // 处理没有/情况
        const existPath = ele.path.match(/^\//) ? ele.path : '/' + ele.path;
        // 获取第一个目录路径 为了匹配/xxx-baik/test/tdemo = /test/tdemo
        const formatUrl = reqApi.replace(/^\/[\w-]+\//, '/');
        if (reqApi === existPath || formatUrl === existPath) {
            return true;
        }
    });
    // 如果找不到调用真实接口
    if (!getApiItem) {
        // 如果找不到就查找公共接口
        // if (cache.commonApiList.length === 0) {
        //     getCommonApiList(() => {
        //         handleCommonApiNext(cache.commonApiList, commonConf.token, req, res)
        //     });
        //     return;
        // }
        // 拿当前缓存数据进行处理
        // handleCommonApiNext(cache.commonApiList, token, req, res);
        proxyApi(req, res);
        return;
    }
    // 实时获取接口状态  不要从缓存里取
    const status = await getApiStatus(getApiItem._id, token);
    const devStatus = status || getApiItem.status;
    // 如果状态开发完成则直接调用真实接口
    if (devStatus === 'done') {
        console.log('接口已开发完成，获取真实数据');
        proxyApi(req, res)
    } else {
        console.log('接口未开发完成，开始从mock获取数据');
        mockHandle(req, res);
    }
}
// 默认请求处理
const handleRequset = function (req, res) {
    const item = config.tokens.find(ele => ele.id === catId)
    if (!item) {
        console.log('\x1B[31m%s', `找不到${catId}对应的项目，请确认配置文件‘config.js’是否正确！`);
        return;
    }
    // 判断当前缓存的api是否有数据，如果没有则重新获取
    if (cache.apiList.length === 0) {
        const apiUrl = `${config.apiUrl}/api/interface/list?token=${item.token}&limit=1000`;
        // 获取制定分离id获取接口列表
        axios.get(apiUrl)
            .then(function (response) {
                // 处理成功情况
                const data = response.data.data;
                // 缓存一份
                cache.apiList = data.list;
                handleApiNext(data.list, item.token, req, res);
            })
            .catch(function (error) {
                // 处理错误情况
                console.log('项目接口列表获取失败！');
                console.log('\x1B[33m%s', error);
            })
        return;
    }
    // 拿当前缓存数据进行处理
    handleApiNext(cache.apiList, item.token, req, res);
}

const onProxy = function (req, res) {
    handleRequset(req, res);
};

// 获取启动传递的参数
const arguments = process.argv.splice(2);
const catId = arguments[0];
const realUrl = arguments[1].replace(/\/+$/, '');
const port = arguments[2] || 30088;
// 获取git仓库中配置config.json内容    git openapi 地址：https://docs.gitlab.com/ee/api/repository_files.html
// 获取git上的配置
config = gitConfig;
commonConf = gitConfig.commonTokens[0];
const server = http.createServer(onProxy);
server.listen(port);
console.log('\x1B[32m%s',arguments.length > 0 ? ("启动成功，代理正监听端口：" + port) : "缺少参数！！！");

// 获取git上的配置
// let gitConfigUrl  = 'https://raw.githubusercontent.com/snowbabykang/yapi-proxy/master/config.json'
// axios.get(gitConfigUrl).then((res) => {
//     const { status, data } = res;
//     if (status !== 200) {
//         console.log('\x1B[31m%s', '获取配置失败，请重新启动');
//         return;
//     }
//     config = data;
//     // commonConf = config.commonTokens[0];
//     const server = http.createServer(onProxy);
//     server.listen(port);
//     console.log(arguments.length > 0 ? ("启动成功，代理正监听端口：" + port) : "缺少参数！！！");
// }).catch(err => {
//     console.log('\x1B[31m%s', err);
// })
