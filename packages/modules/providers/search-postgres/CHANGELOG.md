# @medusajs/search-postgres

## 2.20.0

### Patch Changes

- [#16545](https://github.com/medusajs/medusa/pull/16545) [`4857d15bdcaf5a0648e7adc5b0b40312e23b5c02`](https://github.com/medusajs/medusa/commit/4857d15bdcaf5a0648e7adc5b0b40312e23b5c02) Thanks [@sradevski](https://github.com/sradevski)! - Match admin search prefixes on the last query term so "dtc sta" still finds "Dtc starter".

- [#16361](https://github.com/medusajs/medusa/pull/16361) [`51c48dcb472c3b232b88337030945b2b651e90f8`](https://github.com/medusajs/medusa/commit/51c48dcb472c3b232b88337030945b2b651e90f8) Thanks [@sradevski](https://github.com/sradevski)! - Add a postgres search provider

- [#16581](https://github.com/medusajs/medusa/pull/16581) [`fcee02e4215ba3d7d2f97d24adeb3bed583f43ee`](https://github.com/medusajs/medusa/commit/fcee02e4215ba3d7d2f97d24adeb3bed583f43ee) Thanks [@sradevski](https://github.com/sradevski)! - Install Lakebase Search extensions during `db:migrate` with `CREATE EXTENSION ... CASCADE`, now that Lakebase no longer requires a preload step.

- [#16457](https://github.com/medusajs/medusa/pull/16457) [`693310310610cf439fabb73230187028f2755696`](https://github.com/medusajs/medusa/commit/693310310610cf439fabb73230187028f2755696) Thanks [@sradevski](https://github.com/sradevski)! - Implement Medusa Cloud as a built-in search provider

- Updated dependencies [[`847612908fdd1c11a4df09ccc2e8ab44d338bb04`](https://github.com/medusajs/medusa/commit/847612908fdd1c11a4df09ccc2e8ab44d338bb04), [`785fd2b8a978201638a4d8d5ae9eea483958c0fb`](https://github.com/medusajs/medusa/commit/785fd2b8a978201638a4d8d5ae9eea483958c0fb)]:
  - @medusajs/framework@2.20.0
