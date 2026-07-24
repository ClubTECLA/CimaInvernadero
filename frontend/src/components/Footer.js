import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import { BsFacebook, BsGithub, BsInstagram } from "react-icons/bs";

function Footer() {
  let date = new Date();
  let year = date.getFullYear();
  return (
    <Container fluid className="footer">
      <Row>
        <Col md="4" className="footer-copyright">
          <div className="dev-email">
            <h3>Diseñado y desarrollado por TECLA</h3>
            <h3>Correo: tecla.fcqi@uabc.edu.mx</h3>
          </div>
        </Col>
        <Col md="4" className="footer-copyright">
          <h3>Copyright @ {year}</h3>
        </Col>
        <Col md="4" className="footer-body">
          <ul className="footer-icons">
            <li className="social-icons">
              <a
                href="https://github.com/ClubTECLA"
                target="_blank"
                rel="noreferrer"
                style={{ color: "white" }}
              >
                {/* //TODO: Agregar link */}
                <BsGithub />
              </a>
            </li>
            <li className="social-icons">
              <a
                href="https://www.facebook.com/profile.php?id=61587888058809"
                target="_blank"
                rel="noreferrer"
                style={{ color: "white" }}
              >
                {/* //TODO: Agregar link */}

                <BsFacebook />
              </a>
            </li>
            <li className="social-icons">
              <a href="/" style={{ color: "white" }}>
                {/* //TODO: Agregar link */}

                <BsInstagram />
              </a>
            </li>
          </ul>
        </Col>
      </Row>
    </Container>
  );
}

export default Footer;
