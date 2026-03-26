import { MongoClient } from 'mongodb'

export async function createMongoIdentityStore(config) {
  const client = new MongoClient(config.mongo.uri)

  await client.connect()

  const database = client.db(config.mongo.dbName)
  const walletProfiles = database.collection('wallet_profiles')
  const identityLinks = database.collection('identity_links')

  await Promise.all([
    walletProfiles.createIndex({ walletAddress: 1 }, { unique: true }),
    identityLinks.createIndex({ walletAddress: 1, provider: 1 }, { unique: true }),
    identityLinks.createIndex(
      { provider: 1, providerUserId: 1 },
      {
        partialFilterExpression: {
          providerUserId: { $exists: true },
        },
        unique: true,
      },
    ),
  ])

  return {
    async close() {
      await client.close()
    },

    async deleteIdentityLink(walletAddress, provider) {
      await identityLinks.deleteOne({ provider, walletAddress })
    },

    async findIdentityLinkByProviderUserId(provider, providerUserId) {
      return identityLinks.findOne({ provider, providerUserId })
    },

    async getIdentityLink(walletAddress, provider) {
      return identityLinks.findOne({ provider, walletAddress })
    },

    async getWalletProfile(walletAddress) {
      return walletProfiles.findOne({ walletAddress })
    },

    async listIdentityLinks(walletAddress) {
      return identityLinks.find({ walletAddress }).toArray()
    },

    async upsertIdentityLink(walletAddress, provider, nextFields) {
      const now = new Date()

      await identityLinks.updateOne(
        { provider, walletAddress },
        {
          $set: {
            ...nextFields,
            provider,
            walletAddress,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      )

      return identityLinks.findOne({ provider, walletAddress })
    },

    async upsertWalletProfile(walletAddress, nextFields = {}) {
      const now = new Date()

      await walletProfiles.updateOne(
        { walletAddress },
        {
          $set: {
            ...nextFields,
            updatedAt: now,
            walletAddress,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      )

      return walletProfiles.findOne({ walletAddress })
    },
  }
}
