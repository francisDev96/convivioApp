// routes/gastos.js
const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// ========================================
// OBTENER TODOS LOS GASTOS DE UN PISO
// ========================================
// GET /api/gastos?householdId=house-001
router.get('/', async (req, res) => {
  try {
    const { householdId } = req.query;

    if (!householdId) {
      return res.status(400).json({ 
        error: 'householdId es requerido' 
      });
    }

    const gastos = await prisma.expense.findMany({
      where: { householdId },
      include: {
        creator: {
          select: { 
            id: true, 
            name: true, 
            email: true 
          }
        },
        splits: {
          include: {
            user: {
              select: { 
                id: true, 
                name: true 
              }
            }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.json({
      success: true,
      count: gastos.length,
      data: gastos
    });

  } catch (error) {
    console.error('Error al obtener gastos:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener los gastos' 
    });
  }
});

// ========================================
// OBTENER UN GASTO POR ID
// ========================================
// GET /api/gastos/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const gasto = await prisma.expense.findUnique({
      where: { id },
      include: {
        creator: {
          select: { 
            id: true, 
            name: true, 
            email: true 
          }
        },
        splits: {
          include: {
            user: {
              select: { 
                id: true, 
                name: true 
              }
            }
          }
        }
      }
    });

    if (!gasto) {
      return res.status(404).json({ 
        success: false,
        error: 'Gasto no encontrado' 
      });
    }

    res.json({
      success: true,
      data: gasto
    });

  } catch (error) {
    console.error('Error al obtener gasto:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener el gasto' 
    });
  }
});

// ========================================
// CREAR UN NUEVO GASTO
// ========================================
// POST /api/gastos
// Body: { householdId, creatorId, amount, description, category, memberIds }
router.post('/', async (req, res) => {
  try {
    const { 
      householdId, 
      creatorId, 
      amount, 
      description, 
      category = 'OTHER',
      memberIds // Array de IDs de usuarios entre los que dividir
    } = req.body;

    // Validaciones
    if (!householdId || !creatorId || !amount || !description || !memberIds) {
      return res.status(400).json({ 
        success: false,
        error: 'Faltan campos requeridos: householdId, creatorId, amount, description, memberIds' 
      });
    }

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'memberIds debe ser un array con al menos un ID' 
      });
    }

    // Calcular división equitativa
    const amountPerPerson = parseFloat(amount) / memberIds.length;

    // Crear gasto con splits en una sola transacción
    const nuevoGasto = await prisma.expense.create({
      data: {
        householdId,
        creatorId,
        amount: parseFloat(amount),
        description,
        category,
        splitType: 'EQUAL',
        splits: {
          create: memberIds.map(userId => ({
            userId,
            amountOwed: amountPerPerson,
            isPaid: userId === creatorId // El creador ya pagó su parte
          }))
        }
      },
      include: {
        creator: {
          select: { 
            id: true, 
            name: true 
          }
        },
        splits: {
          include: {
            user: {
              select: { 
                id: true, 
                name: true 
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Gasto creado correctamente',
      data: nuevoGasto
    });

  } catch (error) {
    console.error('Error al crear gasto:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al crear el gasto',
      details: error.message
    });
  }
});

// ========================================
// ACTUALIZAR UN GASTO
// ========================================
// PUT /api/gastos/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, category } = req.body;

    const gastoActualizado = await prisma.expense.update({
      where: { id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(description && { description }),
        ...(category && { category })
      },
      include: {
        creator: {
          select: { id: true, name: true }
        },
        splits: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Gasto actualizado correctamente',
      data: gastoActualizado
    });

  } catch (error) {
    console.error('Error al actualizar gasto:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: 'Gasto no encontrado' 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Error al actualizar el gasto' 
    });
  }
});

// ========================================
// ELIMINAR UN GASTO
// ========================================
// DELETE /api/gastos/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prisma eliminará automáticamente los splits relacionados (CASCADE)
    await prisma.expense.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Gasto eliminado correctamente'
    });

  } catch (error) {
    console.error('Error al eliminar gasto:', error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: 'Gasto no encontrado' 
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Error al eliminar el gasto' 
    });
  }
});

// ========================================
// MARCAR UN SPLIT COMO PAGADO
// ========================================
// PATCH /api/gastos/:expenseId/splits/:splitId/paid
router.patch('/:expenseId/splits/:splitId/paid', async (req, res) => {
  try {
    const { splitId } = req.params;

    const splitActualizado = await prisma.expenseSplit.update({
      where: { id: splitId },
      data: { isPaid: true }
    });

    res.json({
      success: true,
      message: 'Pago registrado correctamente',
      data: splitActualizado
    });

  } catch (error) {
    console.error('Error al marcar pago:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al registrar el pago' 
    });
  }
});

module.exports = router;