from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from ..database import get_session
from ..schemas import PaginatedResponse, PaginationParams, VendorCreate, VendorRead, VendorUpdate
from ..services.vendor_service import VendorService

router = APIRouter(prefix='/vendors', tags=['vendors'])


@router.get('', response_model=PaginatedResponse[VendorRead])
def list_vendors(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session),
  q: str | None = Query(default=None),
  sort: str | None = Query(default=None),
  sort_dir: str = Query(default='desc')
):
  return VendorService(session).list(params.page, params.size, params.offset, q, sort, sort_dir)


@router.post('', response_model=VendorRead, status_code=status.HTTP_201_CREATED)
def create_vendor(payload: VendorCreate, session: Session = Depends(get_session)):
  return VendorService(session).create(payload)


@router.get('/{vendor_id}', response_model=VendorRead)
def get_vendor(vendor_id: int, session: Session = Depends(get_session)):
  svc = VendorService(session)
  return svc.to_read(svc.get_by_id(vendor_id))


@router.put('/{vendor_id}', response_model=VendorRead)
def update_vendor(vendor_id: int, payload: VendorUpdate, session: Session = Depends(get_session)):
  return VendorService(session).update(vendor_id, payload)


@router.delete('/{vendor_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(vendor_id: int, session: Session = Depends(get_session)):
  VendorService(session).delete(vendor_id)
