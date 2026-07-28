const prisma = require('../config/db');
const { redactForAudit } = require('../utils/redact');

const auditLogger = (entity, actionName) => {
  return async (req, res, next) => {
    const originalJson = res.json;
    res.json = function (data) {
      res.json = originalJson; // Restore original JSON method

      // Perform logging asynchronously to avoid blocking the response
      const actorId = req.user ? req.user.id : null;
      const actorRole = req.user ? req.user.role : 'anonymous';

      prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          action: actionName || `${req.method} ${req.originalUrl}`,
          entity: entity || 'api',
          entityId: data && data.id ? data.id : (data && data.user && data.user.id ? data.user.id : null),
          before: req.body ? redactForAudit(req.body) : null,
          after: data ? redactForAudit(data) : null
        }
      }).catch(err => {
        console.error('Audit log creation failed:', err);
      });

      return originalJson.call(this, data);
    };
    next();
  };
};

const logAudit = async ({ actorId, actorRole, action, entity, entityId, before, after, tx }) => {
  try {
    const db = tx || prisma;
    await db.auditLog.create({
      data: {
        actorId,
        actorRole,
        action,
        entity,
        entityId,
        before: redactForAudit(before),
        after: redactForAudit(after)
      }
    });
  } catch (err) {
    console.error('Manual audit log failed:', err);
  }
};

module.exports = { auditLogger, logAudit };
