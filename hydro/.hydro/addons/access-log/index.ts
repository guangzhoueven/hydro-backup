/**
 * access-log：HydroOJ 访问日志 + 设备封禁插件
 *
 * 功能：
 *  - 记录每次页面/接口访问：时间、用户 uid、IP（IPv4/IPv6 原样）、设备（UA 解析摘要 + 完整 UA）、方法、路径
 *  - 控制面板 -> 「访问日志」：分页浏览，支持按 uid / IP / 关键字（路径或 UA）过滤
 *  - 日志页每行可一键「封禁IP」（复用 ip-ban 插件接口，立即生效）或「封禁设备」（按完整 UA 哈希）
 *  - 点击 IP / 设备单元格即复制内容（兼容 HTTP 非安全上下文）
 *  - 控制面板 -> 「设备黑名单」：查看 / 添加 / 解封被禁设备
 *  - 被封设备访问任意页面直接 403；被封 IP 的访问尝试也会被记录下来
 *
 * 数据：`accesslog` 集合（TTL 7 天自动清理）、`deviceban` 集合（TTL 索引）。
 */
import {
    Context, ForbiddenError, Handler, param, PRIV, Types, ValidationError,
} from 'hydrooj';
import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';
import moment from 'moment';
import { Collection, ObjectId } from 'mongodb';
import UserModel from 'hydrooj/src/model/user';

interface AccessLogDoc {
    _id: ObjectId;
    time: Date;
    uid: number;
    ip: string;
    ua: string;
    device: string;
    method: string;
    path: string;
}

interface DeviceBanDoc {
    _id: string; // sha1(ua)
    ua: string;
    reason: string;
    expireAt: Date;
    operator: number;
}

let coll: Collection<AccessLogDoc>;
let dcoll: Collection<DeviceBanDoc>;
const dcache = new LRUCache<string, DeviceBanDoc | null>({ max: 1000, ttl: 60 * 1000 });

const ACCESS_LOG_TTL_DAYS = 7;
const IP_RE = /^[0-9a-fA-F.:]{3,45}$/;

function normalizeIp(ip: string) {
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * 获取访客真实 IP。
 * 经过 cloudflared 等本机反向代理时，socket 来源是 127.0.0.1，
 * 真实客户端 IP 在 CF-Connecting-IP 头中（仅在本机回环连接时才信任该头，防止伪造）。
 */
function getIp(that: any) {
    const direct = normalizeIp(that.request.ip);
    if (direct === '127.0.0.1' || direct === '::1') {
        const cf = that.request.headers['cf-connecting-ip'];
        if (cf && IP_RE.test(cf.trim())) return normalizeIp(cf.trim());
    }
    return direct;
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uaHash(ua: string) {
    return createHash('sha1').update(ua).digest('hex');
}

/** 把 UA 解析成简短的「系统 · 浏览器」摘要 */
export function parseUa(ua: string) {
    const out: string[] = [];
    let m: RegExpMatchArray | null;
    if (/Windows NT 10/.test(ua)) out.push('Windows 10/11');
    else if (/Windows NT 6\.3/.test(ua)) out.push('Windows 8.1');
    else if (/Windows NT 6\.1/.test(ua)) out.push('Windows 7');
    else if ((m = ua.match(/Android (\d+)/))) out.push(`Android ${m[1]}`);
    else if (/iPhone|iPad|iPod/.test(ua)) out.push('iOS');
    else if (/Mac OS X/.test(ua)) out.push('macOS');
    else if (/Linux/.test(ua)) out.push('Linux');
    else out.push('Unknown OS');
    if ((m = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/))) out.push(`Edge ${m[1]}`);
    else if ((m = ua.match(/OPR\/(\d+)/))) out.push(`Opera ${m[1]}`);
    else if ((m = ua.match(/Firefox\/(\d+)/))) out.push(`Firefox ${m[1]}`);
    else if ((m = ua.match(/Chrome\/(\d+)/))) out.push(`Chrome ${m[1]}`);
    else if (/Safari/.test(ua)) out.push('Safari');
    else if (/curl|Wget|python-requests|Hydro|node/i.test(ua)) out.push(ua.slice(0, 30));
    else out.push('Other');
    return out.join(' · ');
}

class AccessLogManageHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('uid', Types.Int, true)
    @param('ip', Types.String, true)
    @param('q', Types.String, true)
    async get(domainId: string, page = 1, uid?: number, ip?: string, q?: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const filter: any = {};
        if (uid) filter.uid = uid;
        if (ip) filter.ip = ip.trim();
        if (q) {
            const rx = new RegExp(escapeRegExp(q.trim()), 'i');
            filter.$or = [{ path: rx }, { ua: rx }, { device: rx }];
        }
        const cursor = coll.find(filter).sort({ time: -1 });
        const [docs, pcount] = await this.ctx.db.paginate(cursor, page, 50);
        const uids = [...new Set(docs.map((d) => d.uid))];
        const udict = await UserModel.getList(domainId, uids);
        this.response.template = 'manage_accesslog.html';
        this.response.body = {
            docs: docs.map((d) => ({
                _id: d._id.toHexString(),
                time: moment(d.time).format('MM-DD HH:mm:ss'),
                uid: d.uid,
                uname: udict[d.uid]?.uname || 'Guest',
                ip: d.ip,
                device: d.device,
                ua: d.ua,
                method: d.method,
                path: d.path,
            })),
            pcount, page,
            fUid: uid || '', fIp: ip || '', fQ: q || '',
        };
    }

    @param('ip', Types.String)
    @param('days', Types.Int, true)
    async postBanIp(_, ip: string, days = 0) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const fn = (global.Hydro.model as any).ipBan?.add;
        if (fn) await fn(ip, days, '访问日志封禁', this.user._id);
        else throw new ValidationError('ip', 'ip-ban addon is not loaded');
        this.response.redirect = this.url('accesslog_manage');
    }

    @param('ua', Types.String)
    @param('days', Types.Int, true)
    async postBanDevice(_, ua: string, days = 0) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        ua = ua.trim();
        if (ua.length < 5) throw new ValidationError('ua');
        if (days < 0) throw new ValidationError('days');
        const expireAt = days > 0
            ? moment().add(days, 'days').toDate()
            : moment().add(1000, 'years').toDate();
        await dcoll.updateOne(
            { _id: uaHash(ua) },
            { $set: { ua, reason: '访问日志封禁', expireAt, operator: this.user._id } },
            { upsert: true },
        );
        dcache.delete(uaHash(ua));
        this.response.redirect = this.url('accesslog_manage');
    }
}

class DeviceBanManageHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const now = new Date();
        const raw = await dcoll.find().sort({ expireAt: -1 }).limit(1000).toArray();
        const docs = raw.map((d) => ({
            hash: d._id.slice(0, 12),
            ua: d.ua,
            reason: d.reason || '',
            expireAt: moment(d.expireAt).format('YYYY-MM-DD HH:mm'),
            expired: d.expireAt <= now,
            permanent: moment(d.expireAt).diff(now, 'years') > 100,
        }));
        this.response.template = 'manage_deviceban.html';
        this.response.body = { docs, now };
    }

    @param('ua', Types.String)
    @param('days', Types.Int, true)
    @param('reason', Types.String, true)
    async postAdd(_, ua: string, days = 0, reason = '') {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        ua = ua.trim();
        if (ua.length < 5) throw new ValidationError('ua');
        if (days < 0) throw new ValidationError('days');
        const expireAt = days > 0
            ? moment().add(days, 'days').toDate()
            : moment().add(1000, 'years').toDate();
        await dcoll.updateOne(
            { _id: uaHash(ua) },
            { $set: { ua, reason: reason.trim(), expireAt, operator: this.user._id } },
            { upsert: true },
        );
        dcache.delete(uaHash(ua));
        this.response.redirect = this.url('deviceban_manage');
    }

    @param('hash', Types.String)
    async postDel(_, hash: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const doc = await dcoll.findOne({ _id: new RegExp(`^${escapeRegExp(hash)}`) });
        if (doc) {
            await dcoll.deleteOne({ _id: doc._id });
            dcache.delete(doc._id);
        }
        this.response.redirect = this.url('deviceban_manage');
    }
}

export function apply(ctx: Context) {
    coll = ctx.db.collection('accesslog');
    dcoll = ctx.db.collection('deviceban');
    ctx.db.ensureIndexes(
        coll,
        { key: { time: 1 }, name: 'ttl', expireAfterSeconds: ACCESS_LOG_TTL_DAYS * 86400 },
        { key: { uid: 1, time: -1 }, name: 'uid' },
        { key: { ip: 1, time: -1 }, name: 'ip' },
    );
    ctx.db.ensureIndexes(
        dcoll,
        { key: { expireAt: 1 }, name: 'ttl', expireAfterSeconds: 0 },
    );
    ctx.Route('accesslog_manage', '/manage/accesslog', AccessLogManageHandler);
    ctx.Route('deviceban_manage', '/manage/deviceban', DeviceBanManageHandler);
    global.Hydro.ui.inject('ControlPanel', 'accesslog_manage', {}, PRIV.PRIV_EDIT_SYSTEM);
    global.Hydro.ui.inject('ControlPanel', 'deviceban_manage', {}, PRIV.PRIV_EDIT_SYSTEM);

    ctx.on('handler/init', async (that) => {
        const ip = getIp(that);
        const ua = (that.request.headers['user-agent'] as string) || '';
        // 1. 记录访问日志（含被封 IP 的访问尝试）
        try {
            await coll.insertOne({
                time: new Date(),
                uid: that.session.uid || 0,
                ip,
                ua,
                device: parseUa(ua),
                method: that.request.method,
                path: that.request.path,
            } as any);
        } catch (e) { /* 日志失败不影响访问 */ }
        // 2. 设备封禁检查
        if (ua) {
            const hash = uaHash(ua);
            let hit = dcache.get(hash);
            if (hit === undefined) {
                hit = await dcoll.findOne({ _id: hash, expireAt: { $gt: new Date() } });
                dcache.set(hash, hit);
            }
            if (hit) {
                throw new ForbiddenError(
                    `Your device has been banned.${hit.reason ? ` Reason: ${hit.reason}` : ''}`,
                );
            }
        }
    });
}
