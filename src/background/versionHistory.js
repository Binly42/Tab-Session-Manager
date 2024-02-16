import log from 'loglevel'

const logDir = "background/versionHistory";

log.debug(logDir, 'begin versionHistory.js')


import git from 'isomorphic-git'

// import http from 'isomorphic-git/http/web'
import LightningFS from '@isomorphic-git/lightning-fs'
import Path from '@isomorphic-git/lightning-fs/src/path';

self.git = git
const fs = self.fs = new LightningFS('fs')
const pfs = self.pfs = self.fs.promises


const git_repo_dir = '/trial'

// NOTE: this name `dir` actually just only for the simplicity when calling isomorphic-git
const dir = git_repo_dir

// 似乎不需要 先mkdir , 好像直接 git.init 就行
// console.log(git_repo_dir)
// await pfs.mkdir(git_repo_dir).catch(reason => console.log('pfs.mkdir catched:', reason))
// console.log(`readir('${git_repo_dir}'):`, await pfs.readdir(git_repo_dir))

await git.init( { fs, dir, } )

// TODO ensure the commit history is correct


export default {
    // TODO 对于 '删除部分历史版本','存在并发commit情况下的undo/rollback' 等场景,
    //      确实需要用到 rebase 功能; 但经查官方尚未实现, 且甚至好像也还没workaround...
    //      如果要实现的话, 也许可以[从 mergeTree 入手](https://github.com/isomorphic-git/isomorphic-git/issues/1736#issuecomment-1478153629)
    commit: async ({
                message,
                session,
                dry_run = false,
            }={}) => {
        await pfs.writeFile(Path.join(dir, 'tracked-session.0001.json'), JSON.stringify(session, null, "  "))

        return git.commit({
            fs,
            dir,
            message: message,
            author: {
                name: '_gittab',
            },
            dryRun: dry_run,
        })
    },
    get_all_raw_history: ({
                // only_for_specific_sessions = [],
                since = undefined,  // Date
                max_version_count = 1000,
            }={}) => {
        return git.log({
            fs,
            dir,
            depth: max_version_count,
            since,
        })
    },
    get_history_by_session: ({
                _sessions = [],
                since = undefined,  // Date
                max_version_count_per_session = 200,
            }={}) => {
        return git.log({
            fs,
            dir,
            depth: max_version_count_per_session,
            since,
            // filepath: sessions,  // TODO
        })
    },
    get_version_detail: async (version) => {
        const tid = version.commit.tree
        const ls = await git.readTree({
            fs,
            dir,
            oid: tid,
            // filepath:   // Note: 该参数应该是用于 缩小检索范围, 只取 某个子目录 而非 整个tree
        }).tree

        // TODO~ 应该只关注 该session对应的那个文件 , 不过其实按目前设想 一个commit肯定也只会包括一个session文件 吧?
        console.assert(ls.length === 1)
        console.assert(ls[0].type = 'blob')
        // NOTE: 按 isomorphic-git官方文档建议 是应该 用readBlob取出blob之后再用Buffer等做解析 ;
        //      但经了解, Buffer 暂时还只在node端有官方实现, 所以这里就先省事一点
        const bid = ls[0].oid
        return _read_parsed_obj(bid)
    },
}

const _read_parsed_obj = (oid, encoding='utf8') => {
    return git.readObject({
        fs,
        dir,
        oid,
        format: 'parsed',
        encoding,
    })
}
