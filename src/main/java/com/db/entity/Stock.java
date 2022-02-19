package com.db.entity;

import javax.persistence.*;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "STOCK")
public class Stock implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "SYMBOL", nullable = false)
    private String Symbol;

    @Column(name = "COLUMN1")
    private String Column1;

    @Column(name = "COLUMN2")
    private String Column2;

    @Column(name = "COLUMN3")
    private String Column3;

    @Column(name = "COLUMN4")
    private String Column4;

    @OneToMany(mappedBy = "stock", orphanRemoval = true)
    private List<Child> children = new ArrayList<>();

    public List<Child> getChildren() {
        return children;
    }

    public void setChildren(List<Child> children) {
        this.children = children;
    }

    public void setSymbol(String Symbol) {
        this.Symbol = Symbol;
    }

    public String getSymbol() {
        return Symbol;
    }

    public void setColumn1(String Column1) {
        this.Column1 = Column1;
    }

    public String getColumn1() {
        return Column1;
    }

    public void setColumn2(String Column2) {
        this.Column2 = Column2;
    }

    public String getColumn2() {
        return Column2;
    }

    public void setColumn3(String Column3) {
        this.Column3 = Column3;
    }

    public String getColumn3() {
        return Column3;
    }

    public void setColumn4(String Column4) {
        this.Column4 = Column4;
    }

    public String getColumn4() {
        return Column4;
    }

    @Override
    public String toString() {
        return "STOCK{" +
                "Symbol=" + Symbol + '\'' +
                "Column1=" + Column1 + '\'' +
                "Column2=" + Column2 + '\'' +
                "Column3=" + Column3 + '\'' +
                "Column4=" + Column4 + '\'' +
                '}';
    }
}
