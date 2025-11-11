from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..database import get_session
from ..models import Order, OrderItem, Product
from ..schemas import PosCheckoutRequest, PosCheckoutResponse

router = APIRouter(prefix='/pos', tags=['pos'])


@router.post('/checkout', response_model=PosCheckoutResponse, status_code=status.HTTP_201_CREATED)
def checkout(
  payload: PosCheckoutRequest,
  session: Session = Depends(get_session)
):
  if not payload.items:
    raise HTTPException(status_code=400, detail='至少需要一個商品進行結帳')

  order = Order(member_id=payload.member_id, discount=payload.discount)
  session.add(order)
  session.flush()  # ensures order.id is available
  total = 0.0

  for item in payload.items:
    product = session.get(Product, item.product_id)
    if not product:
      raise HTTPException(status_code=404, detail=f'Product {item.product_id} not found')
    if product.stock < item.quantity:
      raise HTTPException(status_code=400, detail=f'{product.name} 庫存不足')

    subtotal = product.price * item.quantity
    product.stock -= item.quantity
    product.updated_at = datetime.utcnow()
    session.add(product)
    order_item = OrderItem(order_id=order.id, product_id=product.id, quantity=item.quantity, subtotal=subtotal)
    session.add(order_item)
    total += subtotal

  order.total_price = max(total - payload.discount, 0)
  session.commit()
  session.refresh(order)
  return PosCheckoutResponse(order_id=order.id, total_price=order.total_price, created_at=order.created_at)
