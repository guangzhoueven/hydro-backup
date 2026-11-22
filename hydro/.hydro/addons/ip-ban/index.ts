/**
 * ip-ban：HydroOJ 的 IP 黑名单插件
 *
 * 功能：
 *  - 命中黑名单的 IP 访问任意页面时直接 403（ForbiddenError），支持过期时间
 *  - 控制面板 -> 「IP 黑名单管理」页面：添加 / 删除 / 查看封禁列表
 *  - 本机回环地址（127.0.0.1 / ::1）永远不会被封，避免管理员把自己锁在外面
 *  - 每个请求的查询结果带 60s LRU 缓存；增删时按 IP 精确清缓存
 *
 * 数据存于 MongoDB `ipban` 集合，带 TTL 索引（到期自动清理）。
 */
import {
    Context, ForbiddenError, Handler, param, PRIV, Types, ValidationError,
} from 'hydrooj';
import { LRUCache } from 'lru-cache';
import moment from 'moment';
import { Collection } from 'mongodb';

interface IpBanDoc {
    _id: string; // 规范化后的 IP
    expireAt: Date;
    reason: string;
    operator: number;
}

let coll: Collection<IpBanDoc>;
const cache = new LRUCache<string, IpBanDoc | null>({ max: 1000, ttl: 60 * 1000 });

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
        const cf = that.request.headers['cf-connecting-ip'] as string;
        if (cf && IP_RE.test(cf.trim())) return normalizeIp(cf.trim());
    }
    return direct;
}

const LOCAL_IPS = new Set(['127.0.0.1', '::1']);
const IP_RE = /^[0-9a-fA-F.:]{3,45}$/;

/** 供其他插件调用：封禁/解封一个 IP（含校验与缓存清理） */
export async function addBan(ip: string, days = 0, reason = '', operator = 0) {
    ip = normalizeIp(ip.trim());
    if (!IP_RE.test(ip)) throw new ValidationError('ip');
    if (LOCAL_IPS.has(ip)) throw new ValidationError('ip', 'Cannot ban the local loopback address');
    if (days < 0) throw new ValidationError('days');
    const expireAt = days > 0
        ? moment().add(days, 'days').toDate()
        : moment().add(1000, 'years').toDate();
    await coll.updateOne(
        { _id: ip },
        { $set: { expireAt, reason: reason.trim(), operator } },
        { upsert: true },
    );
    cache.delete(ip);
}

export async function delBan(ip: string) {
    ip = normalizeIp(ip.trim());
    await coll.deleteOne({ _id: ip });
    cache.delete(ip);
}

class IpBanManageHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        const now = new Date();
        const raw = await coll.find().sort({ expireAt: -1 }).limit(1000).toArray();
        const docs = raw.map((d) => ({
            ip: d._id,
            reason: d.reason || '',
            operator: d.operator || 0,
            expireAt: moment(d.expireAt).format('YYYY-MM-DD HH:mm'),
            expired: d.expireAt <= now,
            permanent: moment(d.expireAt).diff(now, 'years') > 100,
        }));
        this.response.template = 'manage_ipban.html';
        this.response.body = { docs };
    }

    @param('ip', Types.String)
    @param('days', Types.Int, true)
    @param('reason', Types.String, true)
    async postAdd(_, ip: string, days = 0, reason = '') {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await addBan(ip, days, reason, this.user._id);
        this.response.redirect = this.url('ipban_manage');
    }

    @param('ip', Types.String)
    async postDel(_, ip: string) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await delBan(ip);
        this.response.redirect = this.url('ipban_manage');
    }
}

export function apply(ctx: Context) {
    coll = ctx.db.collection('ipban');
    ctx.db.ensureIndexes(
        coll,
        { key: { expireAt: 1 }, name: 'ttl', expireAfterSeconds: 0 },
    );
    ctx.Route('ipban_manage', '/manage/ipban', IpBanManageHandler);
    global.Hydro.ui.inject('ControlPanel', 'ipban_manage', {}, PRIV.PRIV_EDIT_SYSTEM);
    // 暴露给其他插件（如 access-log）复用
    global.Hydro.model.ipBan = { add: addBan, del: delBan };

    ctx.on('handler/init', async (that) => {
        const ip = getIp(that);
        if (LOCAL_IPS.has(ip)) return;
        let hit = cache.get(ip);
        if (hit === undefined) {
            hit = await coll.findOne({ _id: ip, expireAt: { $gt: new Date() } });
            cache.set(ip, hit);
        }
        if (hit) {
            throw new ForbiddenError(
                `Your IP address ${ip} has been banned.${hit.reason ? ` Reason: ${hit.reason}` : ''}`,
            );
        }
    });
}
